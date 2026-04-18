import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type {
    InheritanceDiagramSection,
    InheritanceDiagramPerson,
} from '../types'
import { downloadPrintableHtml } from '../actions'
import { useHost } from '../index'

interface Props {
    section: InheritanceDiagramSection
    setHeaderActions?: (node: ReactElement | null) => void
}

// Cap traversal depth so a pathological or adversarial graph (e.g. LLM
// producing circular parent-child edges) can't drive the renderer into an
// infinite loop.
const MAX_GENERATIONS = 6

// --- Layout constants (match the Japanese court-standard template) ---
const LINE_H = 22
const NAME_SIZE = 16
const NAME_LINE_H = 22
const DBL_GAP = 4
const HORIZ_Y_GAP = 90
const CHILD_V_GAP = 30
const GEN_X_STEP = 340
const SPOUSE_GAP = 90
const TEXT_X = 60
const CHILD_TEXT_X = 480
const TRUNK_X = CHILD_TEXT_X - 30
const DBL_X = 80
const DEC_TOP_Y = 20

type RenderedBlock = {
    elements: ReactElement[]
    nameBaseY: number
    blockEndY: number
}

type ChildGroupResult = {
    elements: ReactElement[]
    nameYs: number[]
    endY: number
}

export function InheritanceDiagramSectionView({ section, setHeaderActions }: Props) {
    const data = section.data
    const persons = data?.persons ?? []
    const rels = data?.relationships ?? []
    const variant = data?.variant ?? 'jp-court'

    const svgRef = useRef<SVGSVGElement | null>(null)
    const host = useHost()

    // Expose a PDF download button to the section header. Only render it
    // once the svg is mounted and we can reliably serialize the DOM.
    useEffect(() => {
        if (!setHeaderActions) return
        if (!svgRef.current) return
        if (persons.length === 0 || variant !== 'jp-court') {
            setHeaderActions(null)
            return
        }
        const sectionLabel = section.label || '相続関係説明図'
        const documentTitle = sectionLabel
        const headerTitle = '相 続 関 係 説 明 図'
        const onClick = () => {
            const svgEl = svgRef.current
            if (!svgEl) return
            // Serialize the live SVG including React-computed attributes.
            const serialized = new XMLSerializer().serializeToString(svgEl)
            const today = new Date().toISOString().slice(0, 10)
            // Fire-and-forget; downloadPrintableHtml routes through the
            // MCP Apps host when available (sandbox-safe) or falls back
            // to an anchor download.
            void downloadPrintableHtml({
                svgMarkup: serialized,
                titleLabel: headerTitle,
                documentTitle,
                filename: `inheritance-diagram-${today}.html`,
                host,
            })
        }
        setHeaderActions(
            <button
                type="button"
                className="af-action-btn"
                onClick={onClick}
                title="印刷・PDF 保存用の HTML をダウンロード（開いて ⌘P で PDF 保存、裁判所提出用 A3 横書式）"
            >
                <span aria-hidden>⬇</span>
                <span>PDF</span>
            </button>
        )
        return () => setHeaderActions(null)
        // Re-install when section identity changes.
    }, [setHeaderActions, section.id, section.label, persons.length, variant, host])

    if (persons.length === 0) {
        return <p className="af-empty">No persons in diagram.</p>
    }

    if (variant !== 'jp-court') {
        return (
            <p className="af-empty">
                Inheritance-diagram variant &quot;{variant}&quot; is not yet implemented. Only
                &quot;jp-court&quot; is supported in v0.1.
            </p>
        )
    }

    // --- Pick decedent ---
    const focused = data?.focusedPersonId
        ? persons.find((p) => p.id === data.focusedPersonId)
        : null
    const decedent =
        focused ||
        persons.find((p) => Boolean(p.deathDate)) ||
        persons[0]
    if (!decedent) return <p className="af-empty">No decedent.</p>

    // --- Relationship helpers ---
    const findSpouseOfRoot = (): InheritanceDiagramPerson | null => {
        const rel = rels.find(
            (r) =>
                r.type === 'spouse' &&
                (r.person1Id === decedent.id || r.person2Id === decedent.id)
        )
        if (!rel) return null
        const sid = rel.person1Id === decedent.id ? rel.person2Id : rel.person1Id
        return persons.find((p) => p.id === sid) ?? null
    }

    const findChildren = (
        parentId: string,
        spouseId: string | null
    ): InheritanceDiagramPerson[] => {
        const pids = new Set([parentId])
        if (spouseId) pids.add(spouseId)
        const kids: InheritanceDiagramPerson[] = []
        const seen = new Set<string>()
        for (const r of rels) {
            if (r.type === 'parent-child' && pids.has(r.person1Id)) {
                if (seen.has(r.person2Id)) continue
                const c = persons.find((p) => p.id === r.person2Id)
                if (c) {
                    seen.add(r.person2Id)
                    kids.push(c)
                }
            }
        }
        return kids
    }

    // Find spouse of non-root person. Exclude the root's own spouse edge since
    // that's rendered separately (root gets the big vertical double-line).
    const findSpouse = (personId: string): InheritanceDiagramPerson | null => {
        const rel = rels.find(
            (r) =>
                r.type === 'spouse' &&
                r.person1Id !== decedent.id &&
                r.person2Id !== decedent.id &&
                (r.person1Id === personId || r.person2Id === personId)
        )
        if (!rel) return null
        const sid = rel.person1Id === personId ? rel.person2Id : rel.person1Id
        return persons.find((p) => p.id === sid) ?? null
    }

    // --- Rendering helpers ---
    const blockHeight = (p: InheritanceDiagramPerson): number => {
        let n = 0
        if (p.address) n++
        if (p.birthday) n++
        if (p.deathDate) n++
        n++ // role line
        return n * LINE_H + NAME_LINE_H
    }

    let elementKey = 0
    const nextKey = () => `el-${++elementKey}`

    const renderBlock = (
        p: InheritanceDiagramPerson,
        x: number,
        topY: number,
        roleLabel: string
    ): RenderedBlock => {
        const elements: ReactElement[] = []
        let y = topY
        if (p.address) {
            const lbl = roleLabel === '被相続人' ? '最後の住所' : '住所'
            elements.push(
                <text key={nextKey()} x={x} y={y} fontSize="11pt">
                    {`${lbl}　${p.address}`}
                </text>
            )
            y += LINE_H
        }
        if (p.birthday) {
            elements.push(
                <text key={nextKey()} x={x} y={y} fontSize="11pt">
                    {`出生　${p.birthday}`}
                </text>
            )
            y += LINE_H
        }
        if (p.deathDate) {
            elements.push(
                <text key={nextKey()} x={x} y={y} fontSize="11pt">
                    {`死亡　${p.deathDate}`}
                </text>
            )
            y += LINE_H
        }
        elements.push(
            <text key={nextKey()} x={x + 8} y={y} fontSize="11pt">
                {`（${roleLabel}）`}
            </text>
        )
        y += LINE_H
        elements.push(
            <text
                key={nextKey()}
                x={x}
                y={y}
                fontSize={`${NAME_SIZE}pt`}
                fontWeight="bold"
                letterSpacing="0.2em"
            >
                {p.name}
            </text>
        )
        const nameBaseY = y
        y += NAME_LINE_H
        return { elements, nameBaseY, blockEndY: y }
    }

    // --- Measure helpers ---
    const measureChildSlot = (
        c: InheritanceDiagramPerson,
        depth: number
    ): number => {
        if (depth > MAX_GENERATIONS) return blockHeight(c)
        let h = blockHeight(c)
        const sp = findSpouse(c.id)
        if (sp) h += SPOUSE_GAP + blockHeight(sp)
        const grandkids = findChildren(c.id, sp ? sp.id : null)
        if (grandkids.length > 0) {
            const subH = measureChildGroup(grandkids, depth + 1)
            h = Math.max(h, subH)
        }
        return h
    }

    const measureChildGroup = (
        childList: InheritanceDiagramPerson[],
        depth: number
    ): number => {
        let total = 0
        childList.forEach((c, i) => {
            if (i > 0) total += CHILD_V_GAP
            total += measureChildSlot(c, depth)
        })
        return total
    }

    const lineProps = {
        stroke: '#000',
        strokeWidth: 1.2,
    }

    // --- Recursive: render children at given X, starting at startY ---
    const renderChildGroup = (
        childList: InheritanceDiagramPerson[],
        textX: number,
        startY: number,
        depth: number
    ): ChildGroupResult => {
        const elements: ReactElement[] = []
        const nameYs: number[] = []
        let cy = startY

        if (depth > MAX_GENERATIONS) {
            elements.push(
                <text
                    key={nextKey()}
                    x={textX}
                    y={cy}
                    fontSize="11pt"
                    fill="#999"
                >
                    … (tree truncated at generation {MAX_GENERATIONS})
                </text>
            )
            return { elements, nameYs, endY: cy + LINE_H }
        }

        childList.forEach((c, i) => {
            if (i > 0) cy += CHILD_V_GAP

            const cb = renderBlock(c, textX, cy, c.role || '相続人')
            elements.push(...cb.elements)
            nameYs.push(cb.nameBaseY)

            const childSpouse = findSpouse(c.id)
            let connectorY = cb.nameBaseY

            if (childSpouse) {
                const spTopY = cb.blockEndY + SPOUSE_GAP
                const spBlock = renderBlock(
                    childSpouse,
                    textX,
                    spTopY,
                    childSpouse.role || '配偶者'
                )
                elements.push(...spBlock.elements)

                const miniDblX = textX + 20
                const miniGapTop = cb.blockEndY + 5
                const miniGapBot = spTopY - 25
                elements.push(
                    <line
                        key={nextKey()}
                        x1={miniDblX - DBL_GAP}
                        y1={miniGapTop}
                        x2={miniDblX - DBL_GAP}
                        y2={miniGapBot}
                        {...lineProps}
                    />
                )
                elements.push(
                    <line
                        key={nextKey()}
                        x1={miniDblX + DBL_GAP}
                        y1={miniGapTop}
                        x2={miniDblX + DBL_GAP}
                        y2={miniGapBot}
                        {...lineProps}
                    />
                )
                connectorY = cb.blockEndY + SPOUSE_GAP / 2
            }

            const grandkids = findChildren(c.id, childSpouse ? childSpouse.id : null)
            if (grandkids.length > 0) {
                const gcTextX = textX + GEN_X_STEP
                const gcTrunkX = gcTextX - 30
                const gcResult = renderChildGroup(grandkids, gcTextX, cy, depth + 1)
                elements.push(...gcResult.elements)

                elements.push(
                    <line
                        key={nextKey()}
                        x1={textX + 180}
                        y1={connectorY}
                        x2={gcTrunkX}
                        y2={connectorY}
                        {...lineProps}
                    />
                )

                if (gcResult.nameYs.length > 0) {
                    const gcTrunkTop = Math.min(connectorY, gcResult.nameYs[0])
                    const gcTrunkBot = Math.max(
                        connectorY,
                        gcResult.nameYs[gcResult.nameYs.length - 1]
                    )
                    elements.push(
                        <line
                            key={nextKey()}
                            x1={gcTrunkX}
                            y1={gcTrunkTop}
                            x2={gcTrunkX}
                            y2={gcTrunkBot}
                            {...lineProps}
                        />
                    )
                    gcResult.nameYs.forEach((gny) => {
                        elements.push(
                            <line
                                key={nextKey()}
                                x1={gcTrunkX}
                                y1={gny}
                                x2={gcTextX - 5}
                                y2={gny}
                                {...lineProps}
                            />
                        )
                    })
                }
            }

            cy += measureChildSlot(c, depth)
        })

        return { elements, nameYs, endY: cy }
    }

    // --- Main layout ---
    const dec = renderBlock(decedent, TEXT_X, DEC_TOP_Y, '被相続人')
    const spouse = findSpouseOfRoot()
    const spouseTopY = dec.blockEndY + HORIZ_Y_GAP
    const spBlock = spouse
        ? renderBlock(spouse, TEXT_X, spouseTopY, spouse.role || '相続人')
        : null
    const dblMidY = dec.blockEndY + HORIZ_Y_GAP / 2

    const children = findChildren(decedent.id, spouse ? spouse.id : null)
    const totalChildH = children.length > 0 ? measureChildGroup(children, 0) : 0
    let childGroupTopY = dblMidY - totalChildH / 2
    if (childGroupTopY < 10) childGroupTopY = 10

    const childResult =
        children.length > 0
            ? renderChildGroup(children, CHILD_TEXT_X, childGroupTopY, 0)
            : { elements: [], nameYs: [], endY: childGroupTopY }

    const svgH =
        Math.max(spBlock ? spBlock.blockEndY : dec.blockEndY, childResult.endY) + 30

    const svgParts: ReactElement[] = []

    svgParts.push(...dec.elements)
    if (spBlock) svgParts.push(...spBlock.elements)

    // Double vertical line between decedent and spouse
    if (spouse) {
        const gapTop = dec.blockEndY + 5
        const gapBot = spouseTopY - 25
        svgParts.push(
            <line
                key={nextKey()}
                x1={DBL_X - DBL_GAP}
                y1={gapTop}
                x2={DBL_X - DBL_GAP}
                y2={gapBot}
                {...lineProps}
            />
        )
        svgParts.push(
            <line
                key={nextKey()}
                x1={DBL_X + DBL_GAP}
                y1={gapTop}
                x2={DBL_X + DBL_GAP}
                y2={gapBot}
                {...lineProps}
            />
        )
        if (children.length > 0) {
            svgParts.push(
                <line
                    key={nextKey()}
                    x1={DBL_X + DBL_GAP}
                    y1={dblMidY}
                    x2={TRUNK_X}
                    y2={dblMidY}
                    {...lineProps}
                />
            )
        }
    } else if (children.length > 0) {
        svgParts.push(
            <line
                key={nextKey()}
                x1={TEXT_X + 200}
                y1={dec.nameBaseY}
                x2={TRUNK_X}
                y2={dec.nameBaseY}
                {...lineProps}
            />
        )
    }

    // Children text + sub-trees
    svgParts.push(...childResult.elements)

    // Main trunk for direct children
    if (childResult.nameYs.length > 0) {
        const trunkTop = Math.min(
            spouse ? dblMidY : dec.nameBaseY,
            childResult.nameYs[0]
        )
        const trunkBot = childResult.nameYs[childResult.nameYs.length - 1]
        svgParts.push(
            <line
                key={nextKey()}
                x1={TRUNK_X}
                y1={trunkTop}
                x2={TRUNK_X}
                y2={trunkBot}
                {...lineProps}
            />
        )
        childResult.nameYs.forEach((cny) => {
            svgParts.push(
                <line
                    key={nextKey()}
                    x1={TRUNK_X}
                    y1={cny}
                    x2={CHILD_TEXT_X - 5}
                    y2={cny}
                    {...lineProps}
                />
            )
        })
    }

    return (
        <div className="af-inheritance-diagram">
            <svg
                ref={svgRef}
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                viewBox={`0 0 1400 ${svgH}`}
                style={{ overflow: 'visible' }}
            >
                {svgParts}
            </svg>
        </div>
    )
}
