import type { LogSection } from '../types'

interface Props {
    section: LogSection
}

export function LogSectionView({ section }: Props) {
    const entries = section.data?.entries ?? []
    if (entries.length === 0) return <p className="af-empty">No log entries.</p>
    return (
        <div>
            {entries.map((entry) => {
                const badgeClass =
                    entry.type === 'risk'
                        ? 'af-log-badge af-log-badge--risk'
                        : entry.type === 'decision'
                        ? 'af-log-badge af-log-badge--decision'
                        : entry.type === 'issue'
                        ? 'af-log-badge af-log-badge--issue'
                        : 'af-log-badge'
                return (
                    <div key={entry.id} className="af-log-entry">
                        <span className={badgeClass}>{entry.type}</span>
                        <div>
                            <p className="af-log-title">{entry.title}</p>
                            {entry.description && <p className="af-log-desc">{entry.description}</p>}
                            {entry.decision && (
                                <p className="af-log-desc">
                                    <strong>Decision:</strong> {entry.decision}
                                </p>
                            )}
                        </div>
                        <span className="af-log-status">{entry.status}</span>
                    </div>
                )
            })}
        </div>
    )
}
