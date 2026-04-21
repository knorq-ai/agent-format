import { useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { KanbanSection } from '../types'
import { useSectionChange } from '../index'

interface Props {
    section: KanbanSection
}

// Allow only CSS color tokens we can verify as safe: hex (#rgb/#rgba/#rrggbb/
// #rrggbbaa) and rgb(a)/hsl(a) function notation with a numeric-only argument
// list (no embedded URLs, no `calc()`, no `var()`, no `attr()`). An attacker-
// controlled label.color like "red; background-image: url(https://evil)" is
// otherwise injected as-is into the inline style and can exfiltrate data.
//
// Named CSS colors are intentionally NOT accepted: the naive [a-z]+ pattern
// lets keywords like `inherit` / `currentcolor` / `unset` through and those
// bleed whatever color the parent style had, which defeats the visual intent
// of labels without buying us anything. Authors who want a named color can
// use its hex equivalent.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\(\s*[0-9.,%\s/]+\s*\))$/

function safeColor(c: string | undefined): string | undefined {
    if (!c) return undefined
    const trimmed = c.trim()
    return COLOR_RE.test(trimmed) ? trimmed : undefined
}

// DataTransfer type used for card DnD — namespaced so dropping some other
// draggable (a browser tab URL, a file) onto a column doesn't race with a
// real card drop. We mirror the item id into text/plain as a real fallback
// for hosts that strip custom MIME types (some Safari/WebView configs); the
// drop handler accepts either channel and ignores payloads that don't match
// any known item id, which also rejects spurious drops (URLs, file paths).
const DT_TYPE = 'application/x-agent-format-kanban-item'

export function KanbanSectionView({ section }: Props) {
    const onChange = useSectionChange<KanbanSection>()
    const editable = !!onChange

    // itemId of the card currently being dragged, so drop targets can render
    // a hover affordance without relying on browser-drag-source state (Safari
    // is inconsistent there). null when nothing is dragging.
    const [draggingId, setDraggingId] = useState<string | null>(null)
    // itemId of the title currently being edited inline, or null. One at a
    // time — entering edit on a second card commits the first.
    const [editingId, setEditingId] = useState<string | null>(null)

    const columns = section.data?.columns ?? []
    const items = section.data?.items ?? []
    const labels = section.data?.labels ?? []
    if (columns.length === 0) {
        return <p className="af-empty">No columns in this kanban.</p>
    }
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order)
    const labelById = new Map(labels.map((l) => [l.id, l]))
    const itemsByColumn = new Map<string, typeof items>()
    for (const col of sortedColumns) itemsByColumn.set(col.id, [])
    for (const item of items) {
        const list = itemsByColumn.get(item.status)
        if (list) list.push(item)
    }

    // Move an item to a different column. No-op if the item is already there
    // so drops onto the same column don't churn updatedAt unnecessarily.
    function moveItem(itemId: string, toColumnId: string): void {
        if (!onChange) return
        const item = items.find((i) => i.id === itemId)
        if (!item || item.status === toColumnId) return
        const now = new Date().toISOString()
        const nextItems = items.map((i) =>
            i.id === itemId ? { ...i, status: toColumnId, updatedAt: now } : i
        )
        onChange({
            ...section,
            data: { ...section.data, items: nextItems },
        })
    }

    function renameItem(itemId: string, nextTitle: string): void {
        if (!onChange) return
        const trimmed = nextTitle.trim()
        const item = items.find((i) => i.id === itemId)
        if (!item || trimmed === '' || trimmed === item.title) return
        const now = new Date().toISOString()
        const nextItems = items.map((i) =>
            i.id === itemId ? { ...i, title: trimmed, updatedAt: now } : i
        )
        onChange({
            ...section,
            data: { ...section.data, items: nextItems },
        })
    }

    return (
        <div className="af-kanban">
            {sortedColumns.map((col) => {
                const colItems = itemsByColumn.get(col.id) ?? []
                const isDropTarget =
                    editable && draggingId !== null
                        ? items.find((i) => i.id === draggingId)?.status !== col.id
                        : false
                return (
                    <div
                        key={col.id}
                        className={`af-column${isDropTarget ? ' af-column--drop-target' : ''}`}
                        onDragOver={
                            editable
                                ? (e: DragEvent<HTMLDivElement>) => {
                                      // Accept drops that carry our namespaced type OR a
                                      // plain-text payload (our text/plain fallback for
                                      // hosts that strip custom MIME). Must preventDefault
                                      // or the drop event never fires.
                                      if (
                                          e.dataTransfer.types.includes(DT_TYPE) ||
                                          e.dataTransfer.types.includes('text/plain')
                                      ) {
                                          e.preventDefault()
                                          e.dataTransfer.dropEffect = 'move'
                                      }
                                  }
                                : undefined
                        }
                        onDrop={
                            editable
                                ? (e: DragEvent<HTMLDivElement>) => {
                                      // Prefer the namespaced type; fall back to text/plain
                                      // and validate that the payload matches a known item
                                      // id so foreign drops (URLs, filenames) no-op instead
                                      // of moving a random card.
                                      const raw =
                                          e.dataTransfer.getData(DT_TYPE) ||
                                          e.dataTransfer.getData('text/plain')
                                      if (raw && items.some((i) => i.id === raw)) {
                                          e.preventDefault()
                                          moveItem(raw, col.id)
                                      }
                                      setDraggingId(null)
                                  }
                                : undefined
                        }
                    >
                        <div className="af-column-title">
                            <span>{col.name}</span>
                            <span>
                                {colItems.length}
                                {col.wipLimit ? ` / ${col.wipLimit}` : ''}
                            </span>
                        </div>
                        {colItems.map((item) => {
                            const isDragging = editable && draggingId === item.id
                            const isEditing = editable && editingId === item.id
                            return (
                                <div
                                    key={item.id}
                                    className={`af-card${isDragging ? ' af-card--dragging' : ''}`}
                                    draggable={editable && !isEditing}
                                    onDragStart={
                                        editable
                                            ? (e: DragEvent<HTMLDivElement>) => {
                                                  e.dataTransfer.effectAllowed = 'move'
                                                  e.dataTransfer.setData(DT_TYPE, item.id)
                                                  // Mirror id into text/plain so hosts that
                                                  // drop custom MIME types still get a
                                                  // working payload at drop time.
                                                  e.dataTransfer.setData('text/plain', item.id)
                                                  setDraggingId(item.id)
                                              }
                                            : undefined
                                    }
                                    onDragEnd={editable ? () => setDraggingId(null) : undefined}
                                >
                                    {isEditing ? (
                                        <TitleEditor
                                            initial={item.title}
                                            onCommit={(next) => {
                                                renameItem(item.id, next)
                                                setEditingId(null)
                                            }}
                                            onCancel={() => setEditingId(null)}
                                        />
                                    ) : (
                                        <p
                                            className={`af-card-title${editable ? ' af-card-title--editable' : ''}`}
                                            // Double-click to enter edit, so a single-click
                                            // drag never triggers accidental edit mode. Title
                                            // is the only editable field in v1; description /
                                            // labels / priority come later.
                                            onDoubleClick={
                                                editable
                                                    ? () => setEditingId(item.id)
                                                    : undefined
                                            }
                                            title={editable ? 'Double-click to edit' : undefined}
                                        >
                                            {item.title}
                                        </p>
                                    )}
                                    {item.description && <p className="af-card-desc">{item.description}</p>}
                                    {item.labelIds.length > 0 && (
                                        <div className="af-card-labels">
                                            {item.labelIds.map((lid) => {
                                                const label = labelById.get(lid)
                                                if (!label) return null
                                                const bg = safeColor(label.color)
                                                return (
                                                    <span
                                                        key={lid}
                                                        className="af-label"
                                                        style={bg ? { background: bg } : undefined}
                                                    >
                                                        {label.name}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {(item.assignee || item.dueDate || item.priority) && (
                                        <div className="af-card-meta">
                                            {item.priority && <span>• {item.priority}</span>}
                                            {item.assignee && <span>@ {item.assignee}</span>}
                                            {item.dueDate && <span>⏰ {item.dueDate}</span>}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}

function TitleEditor({
    initial,
    onCommit,
    onCancel,
}: {
    initial: string
    onCommit: (next: string) => void
    onCancel: () => void
}) {
    const [value, setValue] = useState(initial)
    return (
        <input
            className="af-card-title-input"
            type="text"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onCommit(value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    onCommit(value)
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onCancel()
                }
            }}
        />
    )
}
