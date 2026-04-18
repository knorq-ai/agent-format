import { createContext, useContext, useState } from 'react'
import type { ReactElement } from 'react'
import type { AgentFile, Section } from './types'
import { KanbanSectionView } from './sections/KanbanSection'
import { ChecklistSectionView } from './sections/ChecklistSection'
import { NotesSectionView } from './sections/NotesSection'
import { TimelineSectionView } from './sections/TimelineSection'
import { TableSectionView } from './sections/TableSection'
import { LogSectionView } from './sections/LogSection'
import { MetricsSectionView } from './sections/MetricsSection'
import { DiagramSectionView } from './sections/DiagramSection'
import { ReportSectionView } from './sections/ReportSection'
import { FormSectionView } from './sections/FormSection'
import { LinksSectionView } from './sections/LinksSection'
import { ReferencesSectionView } from './sections/ReferencesSection'
import { InheritanceDiagramSectionView } from './sections/InheritanceDiagramSection'
import { FallbackSectionView } from './sections/Fallback'
import { openInViewer } from './actions'
import type { HostBridge } from './host'

export * from './types'
export type { HostBridge } from './host'
export {
    openInViewer,
    buildPrintableHtml,
    downloadPrintableHtml,
} from './actions'

const HostContext = createContext<HostBridge | undefined>(undefined)

export function useHost(): HostBridge | undefined {
    return useContext(HostContext)
}

interface AgentRendererProps {
    data: AgentFile
    className?: string
    /**
     * Host integration. Provide when running inside an MCP Apps iframe or
     * other sandboxed environment where direct window.open / anchor
     * downloads are blocked.
     */
    host?: HostBridge
    /**
     * Controls visibility of the header "Open in browser" action.
     * Default: true. Set to false when the renderer is already used inside
     * the public viewer itself (avoids a self-referential button).
     */
    showOpenInViewer?: boolean
}

export function AgentRenderer({
    data,
    className,
    host,
    showOpenInViewer = true,
}: AgentRendererProps) {
    const sections = [...data.sections].sort((a, b) => a.order - b.order)

    return (
        <HostContext.Provider value={host}>
            <div className={`af-root ${className ?? ''}`}>
                <header className="af-header">
                    <div className="af-header-main">
                        <h1 className="af-title">
                            {data.icon && <span>{data.icon}</span>}
                            <span>{data.name}</span>
                        </h1>
                        {data.description && (
                            <p className="af-description">{data.description}</p>
                        )}
                    </div>
                    {showOpenInViewer && (
                        <div className="af-header-actions">
                            <button
                                type="button"
                                className="af-action-btn"
                                onClick={() => {
                                    // Fire-and-forget; ignore host denial — user
                                    // will notice if the page didn't open and
                                    // can retry.
                                    void openInViewer(data, host)
                                }}
                                title="Open this file in the public agent-format viewer (new tab)"
                            >
                                <span aria-hidden>↗</span>
                                <span>Open in browser</span>
                            </button>
                        </div>
                    )}
                </header>
                <div className="af-sections">
                    {sections.map((section) => (
                        <SectionFrame key={section.id} section={section} />
                    ))}
                </div>
            </div>
        </HostContext.Provider>
    )
}

function SectionFrame({ section }: { section: Section }) {
    const [actions, setActions] = useState<ReactElement | null>(null)
    return (
        <section className="af-section">
            <header className="af-section-header">
                <div className="af-section-header-main">
                    {section.icon && <span>{section.icon}</span>}
                    <span>{section.label}</span>
                </div>
                {actions && (
                    <div className="af-section-header-actions">{actions}</div>
                )}
            </header>
            <div className="af-section-body">
                <SectionRenderer section={section} setHeaderActions={setActions} />
            </div>
        </section>
    )
}

export interface SectionViewExtras {
    /**
     * Optional: a section can mount header-right action buttons (e.g. PDF
     * download) by calling this during render. Pass `null` to remove.
     * Safe to omit — most sections don't use it.
     */
    setHeaderActions?: (node: ReactElement | null) => void
}

function SectionRenderer({
    section,
    setHeaderActions,
}: { section: Section } & SectionViewExtras) {
    switch (section.type) {
        case 'kanban':
            return <KanbanSectionView section={section} />
        case 'checklist':
            return <ChecklistSectionView section={section} />
        case 'notes':
            return <NotesSectionView section={section} />
        case 'timeline':
            return <TimelineSectionView section={section} />
        case 'table':
            return <TableSectionView section={section} />
        case 'log':
            return <LogSectionView section={section} />
        case 'metrics':
            return <MetricsSectionView section={section} />
        case 'diagram':
            return <DiagramSectionView section={section} />
        case 'report':
            return <ReportSectionView section={section} />
        case 'form':
            return <FormSectionView section={section} />
        case 'links':
            return <LinksSectionView section={section} />
        case 'references':
            return <ReferencesSectionView section={section} />
        case 'inheritance-diagram':
            return (
                <InheritanceDiagramSectionView
                    section={section}
                    setHeaderActions={setHeaderActions}
                />
            )
        default:
            return <FallbackSectionView section={section} />
    }
}
