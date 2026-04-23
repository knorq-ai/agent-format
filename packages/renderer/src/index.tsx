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
import { FamilyGraphSectionView } from './sections/FamilyGraphSection'
import { FallbackSectionView } from './sections/Fallback'
import { openInViewer } from './actions'
import type { HostBridge } from './host'
import { findSectionComponent, type RendererPlugin } from './plugins'

export * from './types'
export type { HostBridge } from './host'
export type { RendererPlugin, VariantRendererProps, VariantComponent } from './plugins'
export { findVariantComponent, findSectionComponent } from './plugins'
export {
    openInViewer,
    buildPrintableHtml,
    downloadPrintableHtml,
} from './actions'
export {
    buildViewerUrl,
    encodeViewerHashPayload,
    decodeViewerHashPayload,
} from './share'
export { sanitizeSvgForEmbed } from './sanitize'
export { validateSemantics, type SemanticError } from './validate'

// Spec major version this renderer is built against. Documents whose
// `version` major exceeds this are rendered with a warning banner; the
// renderer still best-effort renders the sections it recognizes, per
// spec § 3.1 ("reject unknown major versions OR degrade gracefully with
// a warning").
export const SPEC_MAJOR = 0

function parseVersionMajor(v: unknown): number | null {
    // Strict: require semver-ish `MAJOR.MINOR(.PATCH)?(-prerelease)?` with
    // purely numeric MAJOR and no leading `v`. Anything else returns null,
    // which the caller treats as "unknown but don't warn" (back-compat).
    if (typeof v !== 'string') return null
    const m = /^(\d+)\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.exec(v)
    return m ? Number(m[1]) : null
}

const HostContext = createContext<HostBridge | undefined>(undefined)
const PluginsContext = createContext<ReadonlyArray<RendererPlugin>>([])

export function useHost(): HostBridge | undefined {
    return useContext(HostContext)
}

/**
 * Returns the plugin list provided to the nearest AgentRenderer. Section
 * renderers use this to look up variant-specific components.
 */
export function usePlugins(): ReadonlyArray<RendererPlugin> {
    return useContext(PluginsContext)
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
     * Controls visibility of the document title/description header.
     * Default: true. Set to false when the host already renders its own
     * top-level file chrome and repeating the document title wastes space.
     */
    showDocumentHeader?: boolean
    /**
     * Controls visibility of the header "Open in browser" action.
     * Default: true. Set to false when the renderer is already used inside
     * the public viewer itself (avoids a self-referential button).
     */
    showOpenInViewer?: boolean
    /**
     * Optional domain-specific plugins (e.g. `@agent-format/jp-court`) that
     * register variant renderers for section types like `family-graph`.
     * Earlier plugins win on conflicting `(sectionType, variant)` pairs.
     */
    plugins?: ReadonlyArray<RendererPlugin>
    /**
     * If provided, the renderer becomes editable: section views that support
     * edits (starting with kanban) surface drag-and-drop and inline-edit
     * affordances, and call this with the next document state on every edit.
     * When omitted, the renderer stays read-only — existing callers keep
     * their current behavior unchanged.
     */
    onChange?: (next: AgentFile) => void
}

const SectionChangeContext = createContext<((next: Section) => void) | undefined>(
    undefined
)

/**
 * A section view that supports edits consumes this to receive a typed
 * change callback: `const onChange = useSectionChange<KanbanSection>()`.
 * Returns `undefined` in read-only mode.
 */
export function useSectionChange<S extends Section>(): ((next: S) => void) | undefined {
    const cb = useContext(SectionChangeContext)
    return cb as ((next: S) => void) | undefined
}

export function AgentRenderer({
    data,
    className,
    host,
    showDocumentHeader = true,
    showOpenInViewer = true,
    plugins = [],
    onChange,
}: AgentRendererProps) {
    const sections = [...data.sections].sort((a, b) => a.order - b.order)
    const docMajor = parseVersionMajor(data.version)
    const unsupportedMajor = docMajor !== null && docMajor > SPEC_MAJOR

    // Fold a typed section edit into the full AgentFile and bump updatedAt
    // so downstream writers (save_agent_file, git diffs) see the change.
    // Memoized so context consumers don't re-run unnecessarily.
    const handleSectionChange = onChange
        ? (nextSection: Section): void => {
              const nextSections = data.sections.map((s) =>
                  s.id === nextSection.id ? nextSection : s
              )
              onChange({
                  ...data,
                  sections: nextSections,
                  updatedAt: new Date().toISOString(),
              })
          }
        : undefined

    return (
        <HostContext.Provider value={host}>
            <SectionChangeContext.Provider value={handleSectionChange}>
            <PluginsContext.Provider value={plugins}>
                <div className={`af-root ${className ?? ''}`}>
                    {unsupportedMajor && (
                        <div
                            className="af-version-warning"
                            role="alert"
                            style={{
                                padding: '8px 12px',
                                margin: '0 0 12px',
                                border: '1px solid #d97706',
                                background: '#fffbeb',
                                color: '#78350f',
                                borderRadius: 6,
                                font: '13px -apple-system, system-ui, sans-serif',
                            }}
                        >
                            Document declares spec version {String(data.version)};
                            this renderer supports {SPEC_MAJOR}.x. Rendering with
                            best-effort fallbacks — unknown fields may be ignored.
                        </div>
                    )}
                    {showDocumentHeader && (
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
                                            // Fire-and-forget; ignore host denial —
                                            // user will notice if the page didn't
                                            // open and can retry.
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
                    )}
                    <div className="af-sections">
                        {sections.map((section) => (
                            <SectionFrame key={section.id} section={section} />
                        ))}
                    </div>
                </div>
            </PluginsContext.Provider>
            </SectionChangeContext.Provider>
        </HostContext.Provider>
    )
}

function SectionFrame({ section }: { section: Section }) {
    const [actions, setActions] = useState<ReactElement | null>(null)
    const plugins = useContext(PluginsContext)
    const PluginView = findSectionComponent(plugins, section.type)
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
                {PluginView ? (
                    <PluginView section={section} setHeaderActions={setActions} />
                ) : (
                    <SectionRenderer section={section} setHeaderActions={setActions} />
                )}
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
        case 'family-graph':
        // `inheritance-diagram` is a deprecated alias for `family-graph`;
        // both route to the same component so existing files keep rendering.
        // eslint-disable-next-line no-fallthrough
        case 'inheritance-diagram':
            return (
                <FamilyGraphSectionView
                    section={section}
                    setHeaderActions={setHeaderActions}
                />
            )
        default:
            return <FallbackSectionView section={section} />
    }
}
