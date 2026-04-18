import type { KanbanSection } from '../types'

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

export function KanbanSectionView({ section }: Props) {
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

    return (
        <div className="af-kanban">
            {sortedColumns.map((col) => {
                const colItems = itemsByColumn.get(col.id) ?? []
                return (
                    <div key={col.id} className="af-column">
                        <div className="af-column-title">
                            <span>{col.name}</span>
                            <span>
                                {colItems.length}
                                {col.wipLimit ? ` / ${col.wipLimit}` : ''}
                            </span>
                        </div>
                        {colItems.map((item) => (
                            <div key={item.id} className="af-card">
                                <p className="af-card-title">{item.title}</p>
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
                        ))}
                    </div>
                )
            })}
        </div>
    )
}
