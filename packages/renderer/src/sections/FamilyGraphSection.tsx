import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type {
    FamilyGraphSection,
    InheritanceDiagramSection,
    FamilyGraphPerson,
} from '../types'
import { findVariantComponent } from '../plugins'
import { usePlugins } from '../index'

// Accept both the current type and the legacy alias so existing .agent
// files that still say `type: "inheritance-diagram"` keep rendering.
type FamilyGraphLike = FamilyGraphSection | InheritanceDiagramSection

interface Props {
    section: FamilyGraphLike
    setHeaderActions?: (node: ReactElement | null) => void
}

// Depth cap so an adversarial or cyclic graph can't run the BFS forever.
const MAX_GENERATIONS = 8

// Default genealogy layout constants.
const CARD_W = 220
const CARD_H = 120
const COL_GAP = 40
const ROW_GAP = 80
const MARGIN_X = 20
const MARGIN_Y = 20

export function FamilyGraphSectionView({ section, setHeaderActions }: Props) {
    const plugins = usePlugins()
    const variant = section.data?.variant

    // Plugin override for the declared variant? Plugins are checked first —
    // if none claim it, fall through to the default genealogy layout.
    const VariantComponent = findVariantComponent(plugins, 'family-graph', variant)
    if (VariantComponent) {
        return <VariantComponent section={section} setHeaderActions={setHeaderActions} />
    }
    // Alias: if someone registered under the legacy section type, honor it.
    if (section.type === 'inheritance-diagram') {
        const AliasComponent = findVariantComponent(plugins, 'inheritance-diagram', variant)
        if (AliasComponent) {
            return <AliasComponent section={section} setHeaderActions={setHeaderActions} />
        }
    }

    return <DefaultGenealogy section={section} />
}

// --- Default layout ----------------------------------------------------------

interface Layout {
    cards: ReadonlyArray<{
        id: string
        person: FamilyGraphPerson
        x: number
        y: number
    }>
    parentChildEdges: ReadonlyArray<{ parent: string; child: string }>
    spouseEdges: ReadonlyArray<{ a: string; b: string; dissolved?: boolean }>
    width: number
    height: number
}

function DefaultGenealogy({ section }: { section: FamilyGraphLike }) {
    const persons = section.data?.persons ?? []
    const rels = section.data?.relationships ?? []
    const focusedId = section.data?.focusedPersonId

    const layout = useMemo(() => computeLayout(persons, rels), [persons, rels])

    if (persons.length === 0) {
        return <p className="af-empty">No persons in diagram.</p>
    }

    return (
        <div className="af-family-graph" style={{ overflow: 'auto' }}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-label="Family graph"
            >
                {/* Parent-child edges (drawn first so they go behind cards) */}
                {layout.parentChildEdges.map((edge, i) => {
                    const p = cardById(layout, edge.parent)
                    const c = cardById(layout, edge.child)
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
                            stroke="currentColor"
                            strokeWidth="1.2"
                            opacity="0.6"
                        />
                    )
                })}
                {/* Spouse edges */}
                {layout.spouseEdges.map((edge, i) => {
                    const a = cardById(layout, edge.a)
                    const b = cardById(layout, edge.b)
                    if (!a || !b) return null
                    const ay = a.y + CARD_H / 2
                    const by = b.y + CARD_H / 2
                    const ax = a.x + CARD_W
                    const bx = b.x
                    if (a.y !== b.y) {
                        // Different generations; draw a simple connector.
                        return (
                            <line
                                key={`sp-${i}`}
                                x1={a.x + CARD_W / 2}
                                y1={ay}
                                x2={b.x + CARD_W / 2}
                                y2={by}
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeDasharray={edge.dissolved ? '4 3' : undefined}
                                opacity="0.6"
                            />
                        )
                    }
                    // Same generation: double horizontal line (or dashed if dissolved).
                    const mid = (ay + by) / 2
                    return (
                        <g key={`sp-${i}`}>
                            <line
                                x1={ax}
                                y1={mid - 3}
                                x2={bx}
                                y2={mid - 3}
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeDasharray={edge.dissolved ? '4 3' : undefined}
                                opacity="0.8"
                            />
                            {!edge.dissolved && (
                                <line
                                    x1={ax}
                                    y1={mid + 3}
                                    x2={bx}
                                    y2={mid + 3}
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                    opacity="0.8"
                                />
                            )}
                        </g>
                    )
                })}
                {/* Person cards */}
                {layout.cards.map((card) => (
                    <PersonCard
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

function cardById(layout: Layout, id: string) {
    return layout.cards.find((c) => c.id === id)
}

function PersonCard({
    person,
    x,
    y,
    focused,
}: {
    person: FamilyGraphPerson
    x: number
    y: number
    focused: boolean
}) {
    return (
        <g transform={`translate(${x}, ${y})`}>
            <rect
                width={CARD_W}
                height={CARD_H}
                rx={8}
                fill={focused ? 'var(--af-accent-soft, #eef2ff)' : 'var(--af-bg-alt, #f7f7f8)'}
                stroke={focused ? 'var(--af-accent, #2251ff)' : 'var(--af-border, #e5e7eb)'}
                strokeWidth={focused ? 2 : 1}
            />
            <text x={12} y={24} fontSize="14" fontWeight="600" fill="currentColor">
                {person.name}
            </text>
            {person.role && (
                <text
                    x={12}
                    y={44}
                    fontSize="11"
                    fill="currentColor"
                    opacity="0.7"
                >
                    {person.role}
                </text>
            )}
            {person.birthday && (
                <text x={12} y={66} fontSize="11" fill="currentColor" opacity="0.7">
                    b. {person.birthday}
                </text>
            )}
            {person.deathDate && (
                <text x={12} y={82} fontSize="11" fill="currentColor" opacity="0.7">
                    d. {person.deathDate}
                </text>
            )}
            {person.address && (
                <text x={12} y={100} fontSize="10" fill="currentColor" opacity="0.55">
                    {truncate(person.address, 30)}
                </text>
            )}
        </g>
    )
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// --- BFS generation assignment ---------------------------------------------

function computeLayout(
    persons: ReadonlyArray<FamilyGraphPerson>,
    rels: ReadonlyArray<{
        type: 'spouse' | 'parent-child'
        person1Id: string
        person2Id: string
        dissolved?: boolean
    }>
): Layout {
    const byId = new Map(persons.map((p) => [p.id, p]))

    // Index edges.
    const childrenOf = new Map<string, string[]>()
    const parentsOf = new Map<string, string[]>()
    const spouseEdges: Array<{ a: string; b: string; dissolved?: boolean }> = []
    for (const r of rels) {
        if (r.type === 'parent-child') {
            if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
            if (!childrenOf.has(r.person1Id)) childrenOf.set(r.person1Id, [])
            childrenOf.get(r.person1Id)!.push(r.person2Id)
            if (!parentsOf.has(r.person2Id)) parentsOf.set(r.person2Id, [])
            parentsOf.get(r.person2Id)!.push(r.person1Id)
        } else if (r.type === 'spouse') {
            if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
            spouseEdges.push({
                a: r.person1Id,
                b: r.person2Id,
                dissolved: r.dissolved,
            })
        }
    }

    // Assign generation depths via BFS from roots (persons with no listed
    // parents). Cycles / back-edges: visited set + hard depth cap.
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

    // Spouses should live in the same generation as their partner when we
    // otherwise have no info about them. Second pass: for any unassigned
    // person, copy a spouse's depth if available.
    for (const s of spouseEdges) {
        if (!depth.has(s.a) && depth.has(s.b)) depth.set(s.a, depth.get(s.b)!)
        if (!depth.has(s.b) && depth.has(s.a)) depth.set(s.b, depth.get(s.a)!)
    }

    // Any remaining unassigned (e.g. graph fragment not reachable): depth 0.
    for (const p of persons) {
        if (!depth.has(p.id)) depth.set(p.id, 0)
    }

    // Group by depth, sort each row for stable order.
    const byGen = new Map<number, FamilyGraphPerson[]>()
    for (const p of persons) {
        const d = depth.get(p.id)!
        if (!byGen.has(d)) byGen.set(d, [])
        byGen.get(d)!.push(p)
    }
    const sortedGens = Array.from(byGen.entries()).sort((a, b) => a[0] - b[0])

    // Within each generation, try to place spouses adjacent. Best-effort.
    for (const [, row] of sortedGens) {
        placeSpousesAdjacent(row, spouseEdges)
    }

    // Assign (x, y). All generations share the same width (longest row), so
    // shorter rows center visually.
    const rowCount = Math.max(...sortedGens.map(([, r]) => r.length), 1)
    const rowWidth = rowCount * CARD_W + (rowCount - 1) * COL_GAP
    const cards: Array<{ id: string; person: FamilyGraphPerson; x: number; y: number }> = []

    sortedGens.forEach(([d, row]) => {
        const y = MARGIN_Y + d * (CARD_H + ROW_GAP)
        const thisRowWidth = row.length * CARD_W + (row.length - 1) * COL_GAP
        const offsetX = MARGIN_X + (rowWidth - thisRowWidth) / 2
        row.forEach((p, i) => {
            cards.push({
                id: p.id,
                person: p,
                x: offsetX + i * (CARD_W + COL_GAP),
                y,
            })
        })
    })

    const width = MARGIN_X * 2 + rowWidth
    const height =
        MARGIN_Y * 2 +
        sortedGens.length * CARD_H +
        Math.max(sortedGens.length - 1, 0) * ROW_GAP

    // Materialize parent-child edges: only include if both persons placed.
    const parentChildEdges: Array<{ parent: string; child: string }> = []
    for (const r of rels) {
        if (r.type !== 'parent-child') continue
        if (!byId.has(r.person1Id) || !byId.has(r.person2Id)) continue
        parentChildEdges.push({ parent: r.person1Id, child: r.person2Id })
    }

    return { cards, parentChildEdges, spouseEdges, width, height }
}

function placeSpousesAdjacent(
    row: FamilyGraphPerson[],
    spouseEdges: ReadonlyArray<{ a: string; b: string }>
): void {
    // Swap so spouses sit next to each other. O(n²) but row sizes are small.
    for (const edge of spouseEdges) {
        const ai = row.findIndex((p) => p.id === edge.a)
        const bi = row.findIndex((p) => p.id === edge.b)
        if (ai < 0 || bi < 0 || Math.abs(ai - bi) === 1) continue
        // Move b next to a.
        const [b] = row.splice(bi, 1)
        const insertAt = ai < bi ? ai + 1 : ai
        row.splice(insertAt, 0, b)
    }
}
