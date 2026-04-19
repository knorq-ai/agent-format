// @agent-format/jp-court — Japanese court (相続関係説明図) visual template
// for the family-graph section type.
//
// Design principle: this plugin provides STYLING only. It never filters,
// hides, or algorithmically decides which persons belong in the diagram.
// The .agent file is the authoritative dataset; lawyers controlling which
// persons to include in a court-filing diagram do so by authoring the file,
// not by delegating that decision to a renderer.

import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
import {
    downloadPrintableHtml,
    useHost,
    type RendererPlugin,
    type VariantRendererProps,
} from '@agent-format/renderer'

// A minimal structural type for the family-graph section data. We pull this
// from section.data inside the component below rather than re-importing the
// renderer's type, so this plugin stays compatible across minor renderer
// versions.
interface FGPerson {
    id: string
    name: string
    role?: string
    birthday?: string
    address?: string
    deathDate?: string
}
interface FGRel {
    type: 'spouse' | 'parent-child'
    person1Id: string
    person2Id: string
    dissolved?: boolean
}

const MAX_GENERATIONS = 8
const CARD_W = 260
const CARD_H = 150
const COL_GAP = 50
const ROW_GAP = 90
const MARGIN_X = 24
const MARGIN_Y = 24
const DBL_GAP = 3

// Main entry — registered against ('family-graph', 'jp-court').
function JPCourtFamilyGraphView({ section, setHeaderActions }: VariantRendererProps) {
    const host = useHost()
    const svgRef = useRef<SVGSVGElement | null>(null)

    const data = section.data as
        | { persons?: FGPerson[]; relationships?: FGRel[]; focusedPersonId?: string }
        | undefined

    const persons = data?.persons ?? []
    const rels = data?.relationships ?? []
    const focusedId = data?.focusedPersonId

    const layout = useMemo(() => computeLayout(persons, rels), [persons, rels])

    // Mount the PDF export button in the section header when we have
    // something to export. Fire-and-forget; host routes through the MCP
    // Apps bridge or falls back to an anchor download.
    useEffect(() => {
        if (!setHeaderActions) return
        if (!svgRef.current) return
        if (persons.length === 0) {
            setHeaderActions(null)
            return
        }
        const sectionLabel = section.label || '相続関係説明図'
        const onClick = () => {
            const svgEl = svgRef.current
            if (!svgEl) return
            const serialized = new XMLSerializer().serializeToString(svgEl)
            const today = new Date().toISOString().slice(0, 10)
            void downloadPrintableHtml({
                svgMarkup: serialized,
                titleLabel: '相 続 関 係 説 明 図',
                documentTitle: sectionLabel,
                filename: `family-graph-jp-court-${today}.html`,
                host,
            })
        }
        setHeaderActions(
            <button
                type="button"
                className="af-action-btn"
                onClick={onClick}
                title="印刷・PDF 保存用の HTML をダウンロード（開いて ⌘P で PDF 保存）"
            >
                <span aria-hidden>⬇</span>
                <span>PDF</span>
            </button>
        )
        return () => setHeaderActions(null)
    }, [setHeaderActions, section.id, section.label, persons.length, host])

    if (persons.length === 0) {
        return <p className="af-empty">No persons in diagram.</p>
    }

    return (
        <div className="af-family-graph af-family-graph--jp-court" style={{ overflow: 'auto' }}>
            <svg
                ref={svgRef}
                xmlns="http://www.w3.org/2000/svg"
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-label="相続関係説明図"
            >
                {/* Parent-child edges */}
                {layout.parentChildEdges.map((edge, i) => {
                    const p = layout.cards.find((c) => c.id === edge.parent)
                    const c = layout.cards.find((c) => c.id === edge.child)
                    if (!p || !c) return null
                    const px = p.x + CARD_W / 2
                    const py = p.y + CARD_H
                    const cx = c.x + CARD_W / 2
                    const cy = c.y
                    const midY = (py + cy) / 2
                    return (
                        <polyline
                            key={`pc-${i}`}
                            points={`${px},${py} ${px},${midY} ${cx},${midY} ${cx},${cy}`}
                            fill="none"
                            stroke="#000"
                            strokeWidth={1.2}
                        />
                    )
                })}
                {/* Spouse edges — rendered as the jp-court double horizontal line */}
                {layout.spouseEdges.map((edge, i) => {
                    const a = layout.cards.find((c) => c.id === edge.a)
                    const b = layout.cards.find((c) => c.id === edge.b)
                    if (!a || !b) return null
                    if (a.y !== b.y) {
                        return (
                            <line
                                key={`sp-${i}`}
                                x1={a.x + CARD_W / 2}
                                y1={a.y + CARD_H / 2}
                                x2={b.x + CARD_W / 2}
                                y2={b.y + CARD_H / 2}
                                stroke="#000"
                                strokeWidth={1.2}
                                strokeDasharray={edge.dissolved ? '4 3' : undefined}
                            />
                        )
                    }
                    const mid = a.y + CARD_H / 2
                    const leftX = Math.min(a.x + CARD_W, b.x + CARD_W)
                    const rightX = Math.max(a.x, b.x)
                    const x1 = Math.min(leftX, rightX)
                    const x2 = Math.max(leftX, rightX)
                    return (
                        <g key={`sp-${i}`}>
                            <line
                                x1={x1}
                                y1={mid - DBL_GAP}
                                x2={x2}
                                y2={mid - DBL_GAP}
                                stroke="#000"
                                strokeWidth={1.2}
                                strokeDasharray={edge.dissolved ? '4 3' : undefined}
                            />
                            {!edge.dissolved && (
                                <line
                                    x1={x1}
                                    y1={mid + DBL_GAP}
                                    x2={x2}
                                    y2={mid + DBL_GAP}
                                    stroke="#000"
                                    strokeWidth={1.2}
                                />
                            )}
                        </g>
                    )
                })}
                {/* Person blocks — jp-court Japanese-legal typography */}
                {layout.cards.map((card) => (
                    <JpPersonBlock
                        key={card.id}
                        person={card.person}
                        x={card.x}
                        y={card.y}
                        focused={card.id === focusedId}
                    />
                ))}
            </svg>
        </div>
    )
}

function JpPersonBlock({
    person,
    x,
    y,
    focused,
}: {
    person: FGPerson
    x: number
    y: number
    focused: boolean
}) {
    const lineGap = 18
    let ty = 22
    const lines: ReactElement[] = []
    if (person.address) {
        const label = person.role === '被相続人' ? '最後の住所' : '住所'
        lines.push(
            <text key="addr" x={12} y={ty} fontSize="11" fill="#000">
                {label}　{truncate(person.address, 24)}
            </text>
        )
        ty += lineGap
    }
    if (person.birthday) {
        lines.push(
            <text key="birth" x={12} y={ty} fontSize="11" fill="#000">
                出生　{person.birthday}
            </text>
        )
        ty += lineGap
    }
    if (person.deathDate) {
        lines.push(
            <text key="death" x={12} y={ty} fontSize="11" fill="#000">
                死亡　{person.deathDate}
            </text>
        )
        ty += lineGap
    }
    if (person.role) {
        lines.push(
            <text key="role" x={20} y={ty} fontSize="11" fill="#000">
                （{person.role}）
            </text>
        )
        ty += lineGap
    }
    // Name (bold, letter-spaced per jp-court convention)
    return (
        <g transform={`translate(${x}, ${y})`}>
            <rect
                width={CARD_W}
                height={CARD_H}
                rx={0}
                fill={focused ? 'var(--af-accent-soft, #eef2ff)' : '#fff'}
                stroke={focused ? 'var(--af-accent, #2251ff)' : '#000'}
                strokeWidth={focused ? 1.5 : 0.8}
            />
            {lines}
            <text
                x={12}
                y={ty + 4}
                fontSize="15"
                fontWeight="bold"
                letterSpacing="0.18em"
                fill="#000"
            >
                {person.name}
            </text>
        </g>
    )
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// --- Layout (reuses the default genealogy BFS — no filtering) --------------

interface Layout {
    cards: ReadonlyArray<{ id: string; person: FGPerson; x: number; y: number }>
    parentChildEdges: ReadonlyArray<{ parent: string; child: string }>
    spouseEdges: ReadonlyArray<{ a: string; b: string; dissolved?: boolean }>
    width: number
    height: number
}

function computeLayout(
    persons: ReadonlyArray<FGPerson>,
    rels: ReadonlyArray<FGRel>
): Layout {
    const byId = new Map(persons.map((p) => [p.id, p]))
    const childrenOf = new Map<string, string[]>()
    const parentsOf = new Map<string, string[]>()
    const spouseEdges: Array<{ a: string; b: string; dissolved?: boolean }> = []

    for (const r of rels) {
        if (r.type === 'parent-child') {
            if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
            ;(childrenOf.get(r.person1Id) ?? childrenOf.set(r.person1Id, []).get(r.person1Id)!).push(r.person2Id)
            ;(parentsOf.get(r.person2Id) ?? parentsOf.set(r.person2Id, []).get(r.person2Id)!).push(r.person1Id)
        } else if (r.type === 'spouse') {
            if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
            spouseEdges.push({ a: r.person1Id, b: r.person2Id, dissolved: r.dissolved })
        }
    }

    const depth = new Map<string, number>()
    const seeds = persons.filter((p) => !parentsOf.has(p.id)).map((p) => p.id)
    const queue: Array<{ id: string; d: number }> = seeds.map((id) => ({ id, d: 0 }))
    while (queue.length > 0) {
        const { id, d } = queue.shift()!
        if (d > MAX_GENERATIONS) continue
        if (depth.has(id)) continue
        depth.set(id, d)
        for (const childId of childrenOf.get(id) ?? []) {
            if (!depth.has(childId)) queue.push({ id: childId, d: d + 1 })
        }
    }
    for (const s of spouseEdges) {
        if (!depth.has(s.a) && depth.has(s.b)) depth.set(s.a, depth.get(s.b)!)
        if (!depth.has(s.b) && depth.has(s.a)) depth.set(s.b, depth.get(s.a)!)
    }
    for (const p of persons) if (!depth.has(p.id)) depth.set(p.id, 0)

    const byGen = new Map<number, FGPerson[]>()
    for (const p of persons) {
        const d = depth.get(p.id)!
        if (!byGen.has(d)) byGen.set(d, [])
        byGen.get(d)!.push(p)
    }
    const sortedGens = Array.from(byGen.entries()).sort((a, b) => a[0] - b[0])
    for (const [, row] of sortedGens) placeSpousesAdjacent(row, spouseEdges)

    const rowCount = Math.max(...sortedGens.map(([, r]) => r.length), 1)
    const rowWidth = rowCount * CARD_W + (rowCount - 1) * COL_GAP
    const cards: Array<{ id: string; person: FGPerson; x: number; y: number }> = []

    sortedGens.forEach(([d, row]) => {
        const y = MARGIN_Y + d * (CARD_H + ROW_GAP)
        const thisRowWidth = row.length * CARD_W + (row.length - 1) * COL_GAP
        const offsetX = MARGIN_X + (rowWidth - thisRowWidth) / 2
        row.forEach((p, i) => {
            cards.push({ id: p.id, person: p, x: offsetX + i * (CARD_W + COL_GAP), y })
        })
    })

    const width = MARGIN_X * 2 + rowWidth
    const height =
        MARGIN_Y * 2 +
        sortedGens.length * CARD_H +
        Math.max(sortedGens.length - 1, 0) * ROW_GAP

    const parentChildEdges: Array<{ parent: string; child: string }> = []
    for (const r of rels) {
        if (r.type !== 'parent-child') continue
        if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
        parentChildEdges.push({ parent: r.person1Id, child: r.person2Id })
    }

    return { cards, parentChildEdges, spouseEdges, width, height }
}

function placeSpousesAdjacent(
    row: FGPerson[],
    spouseEdges: ReadonlyArray<{ a: string; b: string }>
): void {
    for (const edge of spouseEdges) {
        const ai = row.findIndex((p) => p.id === edge.a)
        const bi = row.findIndex((p) => p.id === edge.b)
        if (ai < 0 || bi < 0 || Math.abs(ai - bi) === 1) continue
        const [b] = row.splice(bi, 1)
        const insertAt = ai < bi ? ai + 1 : ai
        row.splice(insertAt, 0, b)
    }
}

// --- Plugin export ----------------------------------------------------------

/**
 * `@agent-format/jp-court` plugin for `AgentRenderer`. Handles
 * `family-graph` sections with `variant: "jp-court"` using Japanese-legal
 * typography and double-line spouse edges, plus a PDF export button.
 *
 * Usage:
 * ```tsx
 * import { AgentRenderer } from '@agent-format/renderer'
 * import { jpCourtPlugin } from '@agent-format/jp-court'
 *
 * <AgentRenderer data={data} plugins={[jpCourtPlugin]} />
 * ```
 *
 * This plugin renders every person in `data.persons`. To limit the diagram
 * to court-compliant heirs (excluding ascendants when descendants exist),
 * edit the .agent file upstream rather than relying on render-time filtering.
 */
export const jpCourtPlugin: RendererPlugin = {
    name: '@agent-format/jp-court',
    variants: {
        'family-graph': {
            'jp-court': JPCourtFamilyGraphView,
        },
        // Also handle the deprecated section type so pre-migration files work.
        'inheritance-diagram': {
            'jp-court': JPCourtFamilyGraphView,
        },
    },
}

export default jpCourtPlugin
