import type { ReportSection } from '../types'

interface Props {
    section: ReportSection
}

export function ReportSectionView({ section }: Props) {
    const source = section.data?.reports ?? []
    const reports = [...source].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    )
    if (reports.length === 0) {
        return <p className="af-empty">No reports yet.</p>
    }
    return (
        <div className="af-reports">
            {reports.map((report) => {
                const dateStr =
                    typeof report.createdAt === 'string' && report.createdAt.length >= 10
                        ? report.createdAt.slice(0, 10)
                        : ''
                return (
                    <article key={report.id} className="af-report">
                        <header className="af-report-header">
                            <h4 className="af-report-title">{report.title}</h4>
                            {dateStr && <time className="af-report-date">{dateStr}</time>}
                        </header>
                        <div className="af-report-content">{report.content}</div>
                    </article>
                )
            })}
        </div>
    )
}
