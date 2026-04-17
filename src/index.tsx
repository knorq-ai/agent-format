import type { AgentFile, Section } from './types'
import { KanbanSectionView } from './sections/KanbanSection'
import { NotesSectionView } from './sections/NotesSection'
import { LogSectionView } from './sections/LogSection'
import { MetricsSectionView } from './sections/MetricsSection'
import { FallbackSectionView } from './sections/Fallback'

export * from './types'

interface AgentRendererProps {
    data: AgentFile
    className?: string
}

export function AgentRenderer({ data, className }: AgentRendererProps) {
    const sections = [...data.sections].sort((a, b) => a.order - b.order)

    return (
        <div className={`af-root ${className ?? ''}`}>
            <header className="af-header">
                <h1 className="af-title">
                    {data.icon && <span>{data.icon}</span>}
                    <span>{data.name}</span>
                </h1>
                {data.description && <p className="af-description">{data.description}</p>}
            </header>
            <div className="af-sections">
                {sections.map((section) => (
                    <section key={section.id} className="af-section">
                        <header className="af-section-header">
                            {section.icon && <span>{section.icon}</span>}
                            <span>{section.label}</span>
                        </header>
                        <div className="af-section-body">
                            <SectionRenderer section={section} />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}

function SectionRenderer({ section }: { section: Section }) {
    switch (section.type) {
        case 'kanban':
            return <KanbanSectionView section={section} />
        case 'notes':
            return <NotesSectionView section={section} />
        case 'log':
            return <LogSectionView section={section} />
        case 'metrics':
            return <MetricsSectionView section={section} />
        default:
            return <FallbackSectionView section={section} />
    }
}
