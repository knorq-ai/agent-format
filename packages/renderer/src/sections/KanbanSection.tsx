import type { KanbanSection } from '../types'

interface Props {
    section: KanbanSection
}

export function KanbanSectionView({ section }: Props) {
    const { columns, items, labels } = section.data
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
                                            return (
                                                <span
                                                    key={lid}
                                                    className="af-label"
                                                    style={{ background: label.color }}
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
