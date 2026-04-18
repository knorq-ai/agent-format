import type { TimelineSection } from '../types'

interface Props {
    section: TimelineSection
}

export function TimelineSectionView({ section }: Props) {
    const items = section.data?.items ?? []
    const milestones = section.data?.milestones ?? []
    const sortedMilestones = [...milestones].sort((a, b) =>
        (a.targetDate ?? '').localeCompare(b.targetDate ?? '')
    )
    const sortedItems = [...items].sort((a, b) =>
        (a.startDate ?? '').localeCompare(b.startDate ?? '')
    )

    return (
        <div className="af-timeline">
            {sortedMilestones.length > 0 && (
                <div className="af-timeline-group">
                    <div className="af-timeline-group-title">Milestones</div>
                    <ul className="af-timeline-list">
                        {sortedMilestones.map((m) => (
                            <li key={m.id} className="af-timeline-row">
                                <span className="af-timeline-date">{m.targetDate ?? '—'}</span>
                                <span className="af-timeline-dot af-timeline-dot--milestone" />
                                <div>
                                    <p className="af-timeline-title">{m.name}</p>
                                    {m.description && (
                                        <p className="af-timeline-desc">{m.description}</p>
                                    )}
                                </div>
                                <span className="af-timeline-status">{m.status}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {sortedItems.length > 0 && (
                <div className="af-timeline-group">
                    <div className="af-timeline-group-title">Items</div>
                    <ul className="af-timeline-list">
                        {sortedItems.map((item) => (
                            <li key={item.id} className="af-timeline-row">
                                <span className="af-timeline-date">
                                    {item.startDate
                                        ? item.endDate && item.endDate !== item.startDate
                                            ? `${item.startDate} → ${item.endDate}`
                                            : item.startDate
                                        : '—'}
                                </span>
                                <span className="af-timeline-dot" />
                                <div>
                                    <p className="af-timeline-title">{item.title}</p>
                                    {item.description && (
                                        <p className="af-timeline-desc">{item.description}</p>
                                    )}
                                </div>
                                <span className="af-timeline-status">{item.status}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {sortedMilestones.length === 0 && sortedItems.length === 0 && (
                <p className="af-empty">No timeline entries.</p>
            )}
        </div>
    )
}
