// @agent-format/jp-court — Japanese court (相続関係説明図) visual template
// for the family-graph section type.
//
// Design principle: STYLING only. This plugin never filters, hides, or
// algorithmically decides which persons belong in the diagram. Every person
// in data.persons is rendered. The layout follows the traditional 裁判所・
// 法務局 format: decedent (被相続人) upper-left, spouse below with double-
// vertical-line, children cascading right — AND any ascendants (parents,
// grandparents, etc.) rendered above the decedent so users doing 事案整理
// can see the full family graph without the "silently dropped ancestors"
// bug of the previous core renderer.

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
    downloadPrintableHtml,
    useSectionChange,
    useHost,
    type RendererPlugin,
    type FamilyGraphSection,
    type InheritanceDiagramSection,
    type VariantRendererProps,
} from '@agent-format/renderer'

// Structural types — we don't re-import from the renderer package so the
// plugin stays compatible across minor renderer versions that might tweak
// internal type shapes.
interface Person {
    id: string
    name: string
    role?: string
    birthday?: string
    address?: string
    isLastAddress?: boolean
    deathDate?: string
}
interface Rel {
    type: 'spouse' | 'parent-child'
    person1Id: string
    person2Id: string
    dissolved?: boolean
}

// Traversal depth cap — stops pathological / adversarial graphs (cycles,
// absurdly deep pedigrees) from running the layout forever.
const MAX_GENERATIONS = 6

// --- Layout constants (Japanese court template) ---
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
// Ancestor layout: generations stack vertically above the decedent.
const ANCESTOR_ROW_H = 140
const ANCESTOR_PAIR_X_GAP = 260
const ANCESTOR_TOP_MARGIN = 20

type RenderedBlock = {
    elements: ReactElement[]
    nameBaseY: number
    blockEndY: number
    overlay: OverlayBox
}

type ChildGroupResult = {
    elements: ReactElement[]
    nameYs: number[]
    endY: number
}

type OverlayBox = {
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
}

type FamilyGraphVariantSection = FamilyGraphSection | InheritanceDiagramSection

function JPCourtFamilyGraphView(props: VariantRendererProps) {
    const { setHeaderActions } = props
    const section = props.section as FamilyGraphVariantSection
    const host = useHost()
    const onChange = useSectionChange<FamilyGraphVariantSection>()
    const stageRef = useRef<HTMLDivElement | null>(null)
    const editorPanelRef = useRef<HTMLDivElement | null>(null)
    const svgRef = useRef<SVGSVGElement | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

    const data = section.data as
        | {
              persons?: Person[]
              relationships?: Rel[]
              focusedPersonId?: string
          }
        | undefined
    const persons = data?.persons ?? []
    const rels = data?.relationships ?? []
    const byId = new Map(persons.map((p) => [p.id, p]))
    const editable = !!onChange

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
                title="印刷・PDF 保存用の HTML をダウンロード（開いて ⌘P で PDF 保存、裁判所提出用 A3 横書式）"
            >
                <span aria-hidden>⬇</span>
                <span>PDF</span>
            </button>
        )
        return () => setHeaderActions(null)
    }, [setHeaderActions, section.id, section.label, persons.length, host])

    useEffect(() => {
        const stageEl = stageRef.current
        if (!stageEl) return
        const syncStageSize = () => {
            setStageSize({
                width: stageEl.clientWidth,
                height: stageEl.clientHeight,
            })
        }
        syncStageSize()
        const observer = new ResizeObserver(syncStageSize)
        observer.observe(stageEl)
        return () => observer.disconnect()
    }, [])

    if (persons.length === 0) {
        return <p className="af-empty">No persons in diagram.</p>
    }

    // --- Identify decedent ---
    const focused = data?.focusedPersonId ? byId.get(data.focusedPersonId) : null
    const decedent = focused || persons.find((p) => Boolean(p.deathDate)) || persons[0]
    if (!decedent) return <p className="af-empty">No decedent.</p>
    const activeSelectedId = selectedId && byId.has(selectedId) ? selectedId : null

    // --- Relationship lookups ---
    const spouseEdgeOf = (personId: string, excludeId?: string): Rel | null => {
        for (const r of rels) {
            if (r.type !== 'spouse') continue
            if (r.person1Id !== personId && r.person2Id !== personId) continue
            if (
                excludeId &&
                (r.person1Id === excludeId || r.person2Id === excludeId)
            ) {
                continue
            }
            return r
        }
        return null
    }
    const findSpouseOfRoot = (): Person | null => {
        const rel = spouseEdgeOf(decedent.id)
        if (!rel) return null
        const sid = rel.person1Id === decedent.id ? rel.person2Id : rel.person1Id
        return byId.get(sid) ?? null
    }
    const findSpouse = (personId: string, excludeId?: string): Person | null => {
        const rel = spouseEdgeOf(personId, excludeId)
        if (!rel) return null
        const sid = rel.person1Id === personId ? rel.person2Id : rel.person1Id
        return byId.get(sid) ?? null
    }
    const findChildren = (parentId: string, spouseId: string | null): Person[] => {
        const pids = new Set([parentId])
        if (spouseId) pids.add(spouseId)
        const kids: Person[] = []
        const seen = new Set<string>()
        for (const r of rels) {
            if (r.type === 'parent-child' && pids.has(r.person1Id)) {
                if (seen.has(r.person2Id)) continue
                const c = byId.get(r.person2Id)
                if (c) {
                    seen.add(r.person2Id)
                    kids.push(c)
                }
            }
        }
        return kids
    }
    const findParents = (childId: string): Person[] => {
        const parents: Person[] = []
        const seen = new Set<string>()
        for (const r of rels) {
            if (r.type !== 'parent-child') continue
            if (r.person2Id !== childId) continue
            if (seen.has(r.person1Id)) continue
            const p = byId.get(r.person1Id)
            if (p) {
                seen.add(r.person1Id)
                parents.push(p)
            }
        }
        return parents
    }
    const selectedPerson = activeSelectedId ? byId.get(activeSelectedId) ?? null : null

    const commitGraph = (nextPersons: Person[], nextRelationships: Rel[]) => {
        if (!onChange) return
        const nextFocusedPersonId =
            data?.focusedPersonId && nextPersons.some((p) => p.id === data.focusedPersonId)
                ? data.focusedPersonId
                : nextPersons[0]?.id
        onChange({
            ...section,
            data: {
                ...(section.data ?? {}),
                persons: nextPersons,
                relationships: nextRelationships,
                focusedPersonId: nextFocusedPersonId,
            },
        })
    }

    const nextPersonId = () => {
        let n = persons.length + 1
        let candidate = `person-${n}`
        while (byId.has(candidate)) {
            n += 1
            candidate = `person-${n}`
        }
        return candidate
    }

    const updateSelectedField = (field: keyof Person, value: string) => {
        if (!selectedPerson) return
        const nextPersons = persons.map((p) => {
            if (p.id !== selectedPerson.id) return p
            if (field === 'name') {
                return { ...p, name: value.trim() || '名称未設定' }
            }
            const normalized = value.trim()
            return {
                ...p,
                [field]: normalized === '' ? undefined : value,
            }
        })
        commitGraph(nextPersons, rels)
    }

    const updateSelectedBooleanField = (field: keyof Person, checked: boolean) => {
        if (!selectedPerson) return
        const nextPersons = persons.map((p) =>
            p.id === selectedPerson.id ? { ...p, [field]: checked || undefined } : p
        )
        commitGraph(nextPersons, rels)
    }

    const addStandalonePerson = () => {
        const id = nextPersonId()
        const person: Person = { id, name: '新しい人物', role: 'その他' }
        setSelectedId(id)
        commitGraph([...persons, person], rels)
    }

    const addParent = () => {
        if (!selectedPerson) return
        const id = nextPersonId()
        const person: Person = { id, name: '新しい親', role: '親' }
        setSelectedId(id)
        commitGraph([...persons, person], [
            ...rels,
            { type: 'parent-child', person1Id: id, person2Id: selectedPerson.id },
        ])
    }

    const addChild = () => {
        if (!selectedPerson) return
        const id = nextPersonId()
        const person: Person = { id, name: '新しい子', role: '相続人' }
        const nextRelationships: Rel[] = [
            ...rels,
            { type: 'parent-child', person1Id: selectedPerson.id, person2Id: id },
        ]
        const spouse = findSpouse(selectedPerson.id)
        if (spouse) {
            nextRelationships.push({
                type: 'parent-child',
                person1Id: spouse.id,
                person2Id: id,
            })
        }
        setSelectedId(id)
        commitGraph([...persons, person], nextRelationships)
    }

    const addSpouse = () => {
        if (!selectedPerson || findSpouse(selectedPerson.id)) return
        const id = nextPersonId()
        const person: Person = { id, name: '新しい配偶者', role: '配偶者' }
        setSelectedId(id)
        commitGraph([...persons, person], [
            ...rels,
            { type: 'spouse', person1Id: selectedPerson.id, person2Id: id },
        ])
    }

    const deleteSelected = () => {
        if (!selectedPerson) return
        const nextPersons = persons.filter((p) => p.id !== selectedPerson.id)
        const nextRelationships = rels.filter(
            (r) => r.person1Id !== selectedPerson.id && r.person2Id !== selectedPerson.id
        )
        setSelectedId(nextPersons[0]?.id ?? null)
        commitGraph(nextPersons, nextRelationships)
    }

    // --- Rendering helpers ---
    const overlayBoxes: OverlayBox[] = []
    const blockHeight = (p: Person): number => {
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
        p: Person,
        x: number,
        topY: number,
        roleLabel: string
    ): RenderedBlock => {
        const elements: ReactElement[] = []
        let y = topY
        if (p.address) {
            const addressLabel = p.isLastAddress ? '最後の住所' : '住所'
            elements.push(
                <text key={nextKey()} x={x} y={y} fontSize="11pt">
                    {`${addressLabel}　${p.address}`}
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
        const overlay = {
            id: p.id,
            name: p.name,
            x: Math.max(0, x - 10),
            y: Math.max(0, topY - 8),
            width: 240,
            height: y - topY + 8,
        }
        overlayBoxes.push(overlay)
        return { elements, nameBaseY, blockEndY: y, overlay }
    }

    // --- Measure helpers for descendants (same as original) ---
    const measureChildSlot = (c: Person, depth: number): number => {
        if (depth > MAX_GENERATIONS) return blockHeight(c)
        let h = blockHeight(c)
        const sp = findSpouse(c.id, decedent.id)
        if (sp) h += SPOUSE_GAP + blockHeight(sp)
        const grandkids = findChildren(c.id, sp ? sp.id : null)
        if (grandkids.length > 0) {
            const subH = measureChildGroup(grandkids, depth + 1)
            h = Math.max(h, subH)
        }
        return h
    }
    const measureChildGroup = (childList: Person[], depth: number): number => {
        let total = 0
        childList.forEach((c, i) => {
            if (i > 0) total += CHILD_V_GAP
            total += measureChildSlot(c, depth)
        })
        return total
    }

    const lineProps = { stroke: '#000', strokeWidth: 1.2 }

    // --- Descendant rendering (unchanged from the original template) ---
    const renderChildGroup = (
        childList: Person[],
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
            const childSpouse = findSpouse(c.id, decedent.id)
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

    // --- Ancestor rendering (NEW — renders upward from decedent) ---
    // Each generation above the decedent sits as a horizontal row of
    // parent-pairs. A vertical line drops from the midpoint of each pair
    // down to their child in the generation below.
    const ancestorElements: ReactElement[] = []
    type AncestorBlock = {
        id: string
        centerX: number
        topY: number
        bottomY: number
        elements: ReactElement[]
        overlay: OverlayBox
    }
    const ancestorByPersonId = new Map<string, AncestorBlock>()

    // BFS upward from the decedent; collect per-level lists of parent pairs.
    type PairInfo = { child: Person; parents: Person[] }
    const ancestorLevels: PairInfo[][] = []
    const visited = new Set<string>([decedent.id])
    let currentLevel: Person[] = [decedent]
    for (let gen = 0; gen < MAX_GENERATIONS && currentLevel.length > 0; gen++) {
        const pairs: PairInfo[] = []
        const next: Person[] = []
        for (const child of currentLevel) {
            const parents = findParents(child.id).filter((p) => !visited.has(p.id))
            if (parents.length > 0) {
                pairs.push({ child, parents })
                for (const p of parents) {
                    visited.add(p.id)
                    next.push(p)
                }
            }
        }
        if (pairs.length === 0) break
        ancestorLevels.push(pairs)
        currentLevel = next
    }

    // Ancestor block dimensions. Keep cards smaller than descendants since
    // ancestor data is usually sparser in legal filings.
    const ancestorBlockW = 200
    const ancestorBlockTextX = 12 // x offset within block
    const renderAncestorBlock = (
        p: Person,
        leftX: number,
        topY: number,
        roleLabel: string
    ): AncestorBlock => {
        const els: ReactElement[] = []
        let y = topY + LINE_H
        if (p.address) {
            const addressLabel = p.isLastAddress ? '最後の住所' : '住所'
            els.push(
                <text
                    key={nextKey()}
                    x={leftX + ancestorBlockTextX}
                    y={y}
                    fontSize="10pt"
                >
                    {`${addressLabel}　${truncate(p.address, 18)}`}
                </text>
            )
            y += LINE_H - 4
        }
        if (p.birthday) {
            els.push(
                <text
                    key={nextKey()}
                    x={leftX + ancestorBlockTextX}
                    y={y}
                    fontSize="10pt"
                >
                    {`出生　${p.birthday}`}
                </text>
            )
            y += LINE_H - 4
        }
        if (p.deathDate) {
            els.push(
                <text
                    key={nextKey()}
                    x={leftX + ancestorBlockTextX}
                    y={y}
                    fontSize="10pt"
                >
                    {`死亡　${p.deathDate}`}
                </text>
            )
            y += LINE_H - 4
        }
        els.push(
            <text
                key={nextKey()}
                x={leftX + ancestorBlockTextX + 8}
                y={y}
                fontSize="10pt"
            >
                {`（${roleLabel}）`}
            </text>
        )
        y += LINE_H - 4
        const nameBaseY = y + 4
        els.push(
            <text
                key={nextKey()}
                x={leftX + ancestorBlockTextX}
                y={nameBaseY}
                fontSize={`${NAME_SIZE - 2}pt`}
                fontWeight="bold"
                letterSpacing="0.15em"
            >
                {p.name}
            </text>
        )
        const bottomY = nameBaseY + LINE_H
        return {
            id: p.id,
            centerX: leftX + ancestorBlockW / 2,
            topY,
            bottomY,
            elements: els,
            overlay: {
                id: p.id,
                name: p.name,
                x: leftX,
                y: topY,
                width: ancestorBlockW,
                height: bottomY - topY + 10,
            },
        }
    }

    // --- Main layout: position decedent after reserving ancestor space ---
    const ancestorStackH = ancestorLevels.length * ANCESTOR_ROW_H
    const decTopY = ANCESTOR_TOP_MARGIN + ancestorStackH + (ancestorStackH > 0 ? 30 : 0)

    const dec = renderBlock(decedent, TEXT_X, decTopY, '被相続人')
    const spouse = findSpouseOfRoot()
    const spouseTopY = dec.blockEndY + HORIZ_Y_GAP
    const spBlock = spouse
        ? renderBlock(spouse, TEXT_X, spouseTopY, spouse.role || '配偶者')
        : null
    const dblMidY = dec.blockEndY + HORIZ_Y_GAP / 2
    const children = findChildren(decedent.id, spouse ? spouse.id : null)
    const totalChildH = children.length > 0 ? measureChildGroup(children, 0) : 0
    let childGroupTopY = dblMidY - totalChildH / 2
    if (childGroupTopY < decTopY) childGroupTopY = decTopY
    const childResult =
        children.length > 0
            ? renderChildGroup(children, CHILD_TEXT_X, childGroupTopY, 0)
            : { elements: [], nameYs: [], endY: childGroupTopY }

    // Record decedent position for ancestor line-up. The decedent's own
    // visual block is rendered separately by renderBlock, so there are no
    // ancestor-layer elements to track here.
    ancestorByPersonId.set(decedent.id, {
        id: decedent.id,
        centerX: TEXT_X + ancestorBlockW / 2,
        topY: decTopY,
        bottomY: dec.blockEndY,
        elements: [],
        overlay: dec.overlay,
    })

    // Render ancestor rows from bottom (nearest parent) upward to the top.
    // ancestorLevels[0] contains the parents of the decedent; last entry has
    // the oldest known ancestors.
    ancestorLevels.forEach((levelPairs, levelIdx) => {
        // rowY: distance above decedent. Bottom row (levelIdx 0) is just
        // above decedent; each subsequent row is one ANCESTOR_ROW_H higher.
        const rowY = decTopY - (levelIdx + 1) * ANCESTOR_ROW_H + 15
        // Lay out parent-pairs side-by-side across this row.
        let cursorX = TEXT_X
        for (const pair of levelPairs) {
            const childBlock = ancestorByPersonId.get(pair.child.id)
            const renderedParents: AncestorBlock[] = []
            for (const parent of pair.parents) {
                const block = renderAncestorBlock(
                    parent,
                    cursorX,
                    rowY,
                    parent.role || '親'
                )
                ancestorByPersonId.set(parent.id, block)
                renderedParents.push(block)
                ancestorElements.push(...block.elements)
                overlayBoxes.push(block.overlay)
                cursorX += ancestorBlockW + 30
            }
            // Spouse double-line between two-parent pairs.
            if (renderedParents.length === 2) {
                const [a, b] = renderedParents
                const midY = (a.topY + a.bottomY) / 2
                const leftEdge = a.centerX + ancestorBlockW / 2 - 10
                const rightEdge = b.centerX - ancestorBlockW / 2 + 10
                ancestorElements.push(
                    <line
                        key={nextKey()}
                        x1={leftEdge}
                        y1={midY - DBL_GAP / 2}
                        x2={rightEdge}
                        y2={midY - DBL_GAP / 2}
                        {...lineProps}
                    />
                )
                ancestorElements.push(
                    <line
                        key={nextKey()}
                        x1={leftEdge}
                        y1={midY + DBL_GAP / 2}
                        x2={rightEdge}
                        y2={midY + DBL_GAP / 2}
                        {...lineProps}
                    />
                )
            }
            // Vertical line from the center of the parent pair down to the child.
            if (childBlock) {
                const pairCenterX =
                    renderedParents.length === 2
                        ? (renderedParents[0].centerX + renderedParents[1].centerX) / 2
                        : renderedParents[0].centerX
                ancestorElements.push(
                    <line
                        key={nextKey()}
                        x1={pairCenterX}
                        y1={Math.max(...renderedParents.map((b) => b.bottomY)) + 5}
                        x2={pairCenterX}
                        y2={childBlock.topY - 5}
                        {...lineProps}
                    />
                )
            }
            cursorX += ANCESTOR_PAIR_X_GAP
        }
    })

    // --- Unreachable persons (orphans / others with only spouse links etc.) ---
    // Render in a small "その他" block below the main diagram so no one is lost.
    const rendered = new Set<string>()
    for (const id of ancestorByPersonId.keys()) rendered.add(id)
    if (spouse) rendered.add(spouse.id)
    const collectRenderedDescendants = (c: Person) => {
        rendered.add(c.id)
        const cs = findSpouse(c.id, decedent.id)
        if (cs) rendered.add(cs.id)
        const gk = findChildren(c.id, cs ? cs.id : null)
        for (const g of gk) collectRenderedDescendants(g)
    }
    for (const c of children) collectRenderedDescendants(c)

    const otherPersons = persons.filter((p) => !rendered.has(p.id))

    const svgParts: ReactElement[] = []
    svgParts.push(...ancestorElements)
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

    // --- Compute final SVG bounds ---
    const baseBottomY = Math.max(spBlock ? spBlock.blockEndY : dec.blockEndY, childResult.endY)

    let otherElements: ReactElement[] = []
    let otherEndY = baseBottomY
    if (otherPersons.length > 0) {
        const otherTopY = baseBottomY + 40
        otherElements.push(
            <text
                key={nextKey()}
                x={TEXT_X}
                y={otherTopY}
                fontSize="11pt"
                fontWeight="bold"
            >
                （その他の関係者）
            </text>
        )
        let ox = TEXT_X
        let oy = otherTopY + 20
        for (const p of otherPersons) {
            if (ox + ancestorBlockW > 1300) {
                ox = TEXT_X
                oy += ANCESTOR_ROW_H
            }
            const b = renderAncestorBlock(p, ox, oy, p.role || 'その他')
            otherElements.push(...b.elements)
            overlayBoxes.push(b.overlay)
            ox += ancestorBlockW + 30
            otherEndY = Math.max(otherEndY, b.bottomY)
        }
        svgParts.push(...otherElements)
    }

    const svgH = Math.max(baseBottomY, otherEndY) + 30
    const selectedOverlay =
        editable && selectedPerson
            ? overlayBoxes.find((overlay) => overlay.id === selectedPerson.id) ?? null
            : null
    const renderEditorAsPopover =
        Boolean(selectedOverlay) && stageSize.width >= 920 && stageSize.height > 0
    let editorPopoverStyle:
        | {
              left: string
              top: string
              width: string
              maxHeight: string
          }
        | undefined
    if (renderEditorAsPopover && selectedOverlay) {
        const margin = 16
        const panelWidth = Math.min(380, Math.max(320, stageSize.width * 0.32))
        const scaleX = stageSize.width / 1400
        const scaleY = stageSize.height / svgH
        const preferredLeft = (selectedOverlay.x + selectedOverlay.width + 18) * scaleX
        const fallbackLeft = selectedOverlay.x * scaleX - panelWidth - 18
        let left =
            preferredLeft + panelWidth <= stageSize.width - margin
                ? preferredLeft
                : fallbackLeft
        left = Math.max(margin, Math.min(left, stageSize.width - panelWidth - margin))
        const estimatedHeight = 340
        let top = selectedOverlay.y * scaleY
        if (top + estimatedHeight > stageSize.height - margin) {
            top = Math.max(margin, stageSize.height - estimatedHeight - margin)
        }
        const maxHeight = Math.max(220, stageSize.height - top - margin)
        editorPopoverStyle = {
            left: `${left}px`,
            top: `${top}px`,
            width: `${panelWidth}px`,
            maxHeight: `${maxHeight}px`,
        }
    }

    useEffect(() => {
        if (!renderEditorAsPopover || !selectedPerson) return
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (editorPanelRef.current?.contains(target)) return
            if (
                target instanceof Element &&
                target.closest('.af-jp-court-node-hitbox')
            ) {
                return
            }
            setSelectedId(null)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [renderEditorAsPopover, selectedPerson])

    const editorPanel = editable ? (
        <div
            ref={editorPanelRef}
            className={`af-jp-court-editor-panel${
                renderEditorAsPopover ? ' af-jp-court-editor-panel--popover' : ''
            }`}
            style={renderEditorAsPopover ? editorPopoverStyle : undefined}
        >
            <div className="af-jp-court-editor-toolbar">
                <button type="button" className="af-action-btn" onClick={addStandalonePerson}>
                    人物を追加
                </button>
                <button
                    type="button"
                    className="af-action-btn"
                    onClick={addParent}
                    disabled={!selectedPerson}
                >
                    親を追加
                </button>
                <button
                    type="button"
                    className="af-action-btn"
                    onClick={addChild}
                    disabled={!selectedPerson}
                >
                    子を追加
                </button>
                <button
                    type="button"
                    className="af-action-btn"
                    onClick={addSpouse}
                    disabled={!selectedPerson || Boolean(selectedPerson && findSpouse(selectedPerson.id))}
                >
                    配偶者を追加
                </button>
                <button
                    type="button"
                    className="af-action-btn"
                    onClick={deleteSelected}
                    disabled={!selectedPerson}
                >
                    人物を削除
                </button>
            </div>
            <p className="af-jp-court-editor-note">
                図の人物をクリックして内容を編集できます。
            </p>
            {selectedPerson ? (
                <>
                    <p className="af-jp-court-editor-selected">
                        <strong>{selectedPerson.name}</strong> を編集中
                    </p>
                    <div className="af-jp-court-editor-grid">
                        <div className="af-jp-court-editor-field af-jp-court-editor-field--full">
                            <label htmlFor={`${section.id}-person-address`}>住所</label>
                            <input
                                id={`${section.id}-person-address`}
                                type="text"
                                value={selectedPerson.address ?? ''}
                                onChange={(e) => updateSelectedField('address', e.target.value)}
                            />
                        </div>
                        <div className="af-jp-court-editor-field af-jp-court-editor-field--full">
                            <label className="af-jp-court-editor-checkbox">
                                <input
                                    type="checkbox"
                                    checked={Boolean(selectedPerson.isLastAddress)}
                                    onChange={(e) =>
                                        updateSelectedBooleanField(
                                            'isLastAddress',
                                            e.target.checked
                                        )
                                    }
                                />
                                <span>住所ラベルを「最後の住所」にする</span>
                            </label>
                        </div>
                        <div className="af-jp-court-editor-field">
                            <label htmlFor={`${section.id}-person-birthday`}>生年月日</label>
                            <input
                                id={`${section.id}-person-birthday`}
                                type="text"
                                value={selectedPerson.birthday ?? ''}
                                onChange={(e) => updateSelectedField('birthday', e.target.value)}
                            />
                        </div>
                        <div className="af-jp-court-editor-field">
                            <label htmlFor={`${section.id}-person-death`}>死亡日</label>
                            <input
                                id={`${section.id}-person-death`}
                                type="text"
                                value={selectedPerson.deathDate ?? ''}
                                onChange={(e) => updateSelectedField('deathDate', e.target.value)}
                            />
                        </div>
                        <div className="af-jp-court-editor-field">
                            <label htmlFor={`${section.id}-person-role`}>続柄</label>
                            <input
                                id={`${section.id}-person-role`}
                                type="text"
                                value={selectedPerson.role ?? ''}
                                onChange={(e) => updateSelectedField('role', e.target.value)}
                            />
                        </div>
                        <div className="af-jp-court-editor-field af-jp-court-editor-field--full">
                            <label htmlFor={`${section.id}-person-name`}>氏名</label>
                            <input
                                id={`${section.id}-person-name`}
                                type="text"
                                value={selectedPerson.name}
                                onChange={(e) => updateSelectedField('name', e.target.value)}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <p className="af-jp-court-editor-empty">編集する人物を図から選択してください。</p>
            )}
        </div>
    ) : null

    // The jp-court template is a legal print artifact — always black-on-white
    // per court-filing convention. Force the panel's own theme here so a
    // dark-mode viewer doesn't leak a black background behind our black-ink
    // text. Matches what the PDF export produces.
    return (
        <div
            className="af-family-graph af-family-graph--jp-court"
            style={{
                overflow: 'auto',
                background: '#fff',
                color: '#000',
                padding: 24,
                borderRadius: 6,
            }}
        >
            <div ref={stageRef} className="af-jp-court-stage">
                <svg
                    ref={svgRef}
                    xmlns="http://www.w3.org/2000/svg"
                    width="100%"
                    viewBox={`0 0 1400 ${svgH}`}
                    style={{ overflow: 'visible' }}
                    role="img"
                    aria-label="相続関係説明図"
                >
                    {svgParts}
                </svg>
                {editable && (
                    <div className="af-jp-court-editor-layer">
                        {overlayBoxes.map((overlay) => (
                            <button
                                key={overlay.id}
                                type="button"
                                className={`af-jp-court-node-hitbox${
                                    overlay.id === activeSelectedId ? ' is-selected' : ''
                                }`}
                                style={{
                                    left: `${(overlay.x / 1400) * 100}%`,
                                    top: `${(overlay.y / svgH) * 100}%`,
                                    width: `${(overlay.width / 1400) * 100}%`,
                                    height: `${(overlay.height / svgH) * 100}%`,
                                }}
                                onClick={() => setSelectedId(overlay.id)}
                                aria-label={`${overlay.name} を編集`}
                                title={`${overlay.name} を編集`}
                            />
                        ))}
                    </div>
                )}
                {renderEditorAsPopover && editorPanel}
            </div>
            {!renderEditorAsPopover && editorPanel}
        </div>
    )
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/**
 * `@agent-format/jp-court` plugin for `AgentRenderer`. Handles
 * `family-graph` sections with `variant: "jp-court"` using Japanese-legal
 * typography: decedent at upper-left with role label `（被相続人）` above
 * the name, spouse below connected by a vertical double-line, children
 * cascading right, and any ancestors rendered above the decedent with
 * their own pair-and-line structure. Also provides a PDF export button.
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
 * to court-compliant heirs (e.g. excluding ascendants when descendants
 * exist per 民法 887), edit the .agent file upstream rather than relying
 * on render-time filtering.
 */
export const jpCourtPlugin: RendererPlugin = {
    name: '@agent-format/jp-court',
    variants: {
        'family-graph': {
            'jp-court': JPCourtFamilyGraphView,
        },
        // Deprecated alias.
        'inheritance-diagram': {
            'jp-court': JPCourtFamilyGraphView,
        },
    },
}

export default jpCourtPlugin
