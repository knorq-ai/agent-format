import type { ReportSection } from '../types'

interface Props {
    section: ReportSection
}

export function ReportSectionView({ section }: Props) {
    const reports = [...section.data.reports].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
    )
    if (reports.length === 0) {
        return <p className="af-empty">No reports yet.</p>
    }
    return (
        <div className="af-reports">
            {reports.map((report) => (
                <article key={report.id} className="af-report">
                    <header className="af-report-header">
                        <h4 className="af-report-title">{report.title}</h4>
                        <time className="af-report-date">{report.createdAt.slice(0, 10)}</time>
                    </header>
                    <div className="af-report-content">{report.content}</div>
                </article>
            ))}
        </div>
    )
}
