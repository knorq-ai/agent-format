// Semantic validation — the checks the JSON Schema cannot express.
//
// The schema in `schemas/agent.schema.json` is structural: it enforces shape
// and required fields. It cannot enforce that IDs are unique within a parent
// collection, that a kanban item's `status` points at a real column, or that
// a table cell for a `status` column has the `{ state, comment? }` object
// shape. Those checks live here. Call `validateSemantics` after the schema
// validation passes so reports surface one layer at a time.
//
// This module is pure TS with no deps so both the CLI and, in future, other
// validators can lift it verbatim.

export interface SemanticError {
    instancePath: string
    message: string
}

type AnyObj = Record<string, unknown>

function isObj(x: unknown): x is AnyObj {
    return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// Collect duplicate IDs across an array of { id: string } objects and emit
// one error per duplicate group (not per collision) so the CLI output stays
// readable on large boards.
// instancePath values emitted here follow RFC 6901 JSON Pointer — the same
// format Ajv uses — so CLI stderr and the viewer's error list can be filtered
// with `jq`/awk uniformly regardless of which stage raised the error.
function checkUniqueIds(
    items: unknown,
    basePath: string,
    errors: SemanticError[]
): void {
    if (!Array.isArray(items)) return
    const seen = new Map<string, number[]>()
    items.forEach((item, idx) => {
        if (!isObj(item)) return
        const id = item.id
        if (typeof id !== 'string') return
        const hits = seen.get(id)
        if (hits) hits.push(idx)
        else seen.set(id, [idx])
    })
    for (const [id, hits] of seen) {
        if (hits.length > 1) {
            errors.push({
                instancePath: `${basePath}/${hits[0]}`,
                message: `duplicate id "${id}" in ${basePath} (also at ${hits
                    .slice(1)
                    .map((i) => `${basePath}/${i}`)
                    .join(', ')})`,
            })
        }
    }
}

function validateKanban(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const columns = Array.isArray(data.columns) ? data.columns : []
    const items = Array.isArray(data.items) ? data.items : []
    const labels = Array.isArray(data.labels) ? data.labels : []
    const team = Array.isArray(data.team) ? data.team : []

    const sec = `/sections/${secIdx}/data`
    checkUniqueIds(columns, `${sec}/columns`, errors)
    checkUniqueIds(items, `${sec}/items`, errors)
    checkUniqueIds(labels, `${sec}/labels`, errors)
    checkUniqueIds(team, `${sec}/team`, errors)

    const colIds = new Set(
        columns
            .filter(isObj)
            .map((c) => c.id)
            .filter((v): v is string => typeof v === 'string')
    )
    const labelIds = new Set(
        labels
            .filter(isObj)
            .map((l) => l.id)
            .filter((v): v is string => typeof v === 'string')
    )
    const itemIds = new Set(
        items
            .filter(isObj)
            .map((i) => i.id)
            .filter((v): v is string => typeof v === 'string')
    )

    items.forEach((it, idx) => {
        if (!isObj(it)) return
        const path = `${sec}/items/${idx}`
        if (typeof it.status === 'string' && !colIds.has(it.status)) {
            errors.push({
                instancePath: `${path}/status`,
                message: `status "${it.status}" is not a known column id`,
            })
        }
        if (Array.isArray(it.labelIds)) {
            it.labelIds.forEach((lid, li) => {
                if (typeof lid === 'string' && !labelIds.has(lid)) {
                    errors.push({
                        instancePath: `${path}/labelIds/${li}`,
                        message: `labelId "${lid}" is not defined in labels`,
                    })
                }
            })
        }
        if (Array.isArray(it.blockedBy)) {
            it.blockedBy.forEach((bid, bi) => {
                if (typeof bid === 'string' && !itemIds.has(bid)) {
                    errors.push({
                        instancePath: `${path}/blockedBy/${bi}`,
                        message: `blockedBy "${bid}" is not a known item id`,
                    })
                }
            })
        }
    })
}

const TABLE_STATUS_STATES = new Set(['todo', 'inprogress', 'almost', 'done', 'warn'])

function validateTable(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const columns = Array.isArray(data.columns) ? data.columns : []
    const rows = Array.isArray(data.rows) ? data.rows : []
    const sec = `/sections/${secIdx}/data`

    // Table column keys must be unique — two `"priority"` columns in the
    // same table is ambiguous. Schema doesn't enforce this because it
    // treats columns as an array of independent objects.
    const keys = columns
        .filter(isObj)
        .map((c) => c.key)
        .filter((v): v is string => typeof v === 'string')
    const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i)
    for (const k of new Set(dupKeys)) {
        errors.push({
            instancePath: `${sec}/columns`,
            message: `duplicate column key "${k}"`,
        })
    }

    // For columns typed "status", every row's value for that key must be
    // `{ state: <enum>, comment?: string }` per SPEC § 4.5.
    const statusKeys: string[] = []
    columns.forEach((c) => {
        if (isObj(c) && c.type === 'status' && typeof c.key === 'string') {
            statusKeys.push(c.key)
        }
    })
    if (statusKeys.length > 0) {
        rows.forEach((row, rIdx) => {
            if (!isObj(row)) return
            for (const key of statusKeys) {
                const cell = row[key]
                if (cell === undefined || cell === null) continue
                const path = `${sec}/rows/${rIdx}/${key}`
                if (!isObj(cell)) {
                    errors.push({
                        instancePath: path,
                        message: `status cell must be an object { state, comment? }`,
                    })
                    continue
                }
                if (typeof cell.state !== 'string' || !TABLE_STATUS_STATES.has(cell.state)) {
                    errors.push({
                        instancePath: `${path}/state`,
                        message: `status.state must be one of ${[...TABLE_STATUS_STATES].join('|')}`,
                    })
                }
                if ('comment' in cell && cell.comment !== undefined && typeof cell.comment !== 'string') {
                    errors.push({
                        instancePath: `${path}/comment`,
                        message: `status.comment must be a string if present`,
                    })
                }
            }
        })
    }
}

function validateChecklist(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const groups = Array.isArray(data.groups) ? data.groups : []
    const sec = `/sections/${secIdx}/data`
    checkUniqueIds(groups, `${sec}/groups`, errors)
    groups.forEach((g, gi) => {
        if (!isObj(g)) return
        checkUniqueIds(g.items, `${sec}/groups/${gi}/items`, errors)
    })
}

function validateNotes(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.blocks, `/sections/${secIdx}/data/blocks`, errors)
}

function validateTimeline(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const sec = `/sections/${secIdx}/data`
    checkUniqueIds(data.items, `${sec}/items`, errors)
    checkUniqueIds(data.milestones, `${sec}/milestones`, errors)
}

function validateLog(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.entries, `/sections/${secIdx}/data/entries`, errors)
}

function validateMetrics(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.cards, `/sections/${secIdx}/data/cards`, errors)
}

function validateReport(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.reports, `/sections/${secIdx}/data/reports`, errors)
}

function validateForm(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const sec = `/sections/${secIdx}/data`
    checkUniqueIds(data.fields, `${sec}/fields`, errors)
    checkUniqueIds(data.submissions, `${sec}/submissions`, errors)
}

function validateLinks(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.items, `/sections/${secIdx}/data/items`, errors)
}

function validateReferences(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    checkUniqueIds(data.items, `/sections/${secIdx}/data/items`, errors)
}

function validateFamilyGraph(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    if (!isObj(data)) return
    const sec = `/sections/${secIdx}/data`
    checkUniqueIds(data.persons, `${sec}/persons`, errors)
    const personIds = new Set(
        (Array.isArray(data.persons) ? data.persons : [])
            .filter(isObj)
            .map((p) => p.id)
            .filter((v): v is string => typeof v === 'string')
    )
    const rels = Array.isArray(data.relationships) ? data.relationships : []
    rels.forEach((r, ri) => {
        if (!isObj(r)) return
        for (const key of ['person1Id', 'person2Id'] as const) {
            const v = r[key]
            if (typeof v === 'string' && !personIds.has(v)) {
                errors.push({
                    instancePath: `${sec}/relationships/${ri}/${key}`,
                    message: `${key} "${v}" is not a known person id`,
                })
            }
        }
    })
    if (typeof data.focusedPersonId === 'string' && !personIds.has(data.focusedPersonId)) {
        errors.push({
            instancePath: `${sec}/focusedPersonId`,
            message: `focusedPersonId "${data.focusedPersonId}" is not a known person id`,
        })
    }
}

// Hard cap on diagram nesting. Schema doesn't bound `children` depth, so a
// hostile `.agent` file could craft a 15k-deep diagram that stack-overflows
// a naive recursive walk. This cap is well above anything a human-authored
// org-chart / mind-map would need; exceeding it is treated as a validation
// error rather than a crash.
const DIAGRAM_MAX_DEPTH = 256

function validateDiagram(
    data: unknown,
    secIdx: number,
    errors: SemanticError[]
): void {
    // Diagram IDs must be unique across the entire tree (recursive).
    if (!isObj(data) || !isObj(data.root)) return
    const seen = new Map<string, string>()
    const sec = `/sections/${secIdx}/data`
    let depthExceededReported = false
    // Check depth *before* recursing so we bail at the cap itself (not one
    // frame past it), and emit a bounded instancePath — a pathologically
    // deep payload would otherwise produce a multi-KB path on stderr / in
    // the viewer UI.
    const walk = (node: unknown, path: string, depth: number): void => {
        if (!isObj(node)) return
        const id = node.id
        if (typeof id === 'string') {
            const prior = seen.get(id)
            if (prior !== undefined) {
                errors.push({
                    instancePath: path,
                    message: `duplicate diagram node id "${id}" (first at ${prior})`,
                })
            } else {
                seen.set(id, path)
            }
        }
        const children = Array.isArray(node.children) ? node.children : []
        for (let i = 0; i < children.length; i++) {
            if (depth + 1 > DIAGRAM_MAX_DEPTH) {
                if (!depthExceededReported) {
                    errors.push({
                        instancePath: `${sec}/root`,
                        message: `diagram nesting exceeds ${DIAGRAM_MAX_DEPTH} levels — likely malformed or hostile input`,
                    })
                    depthExceededReported = true
                }
                return
            }
            walk(children[i], `${path}/children/${i}`, depth + 1)
        }
    }
    walk(data.root, `${sec}/root`, 0)
}

export function validateSemantics(doc: unknown): SemanticError[] {
    const errors: SemanticError[] = []
    if (!isObj(doc)) return errors

    // Top-level task IDs must be unique.
    const config = doc.config
    if (isObj(config) && Array.isArray(config.tasks)) {
        checkUniqueIds(config.tasks, `/config/tasks`, errors)
    }

    const sections = Array.isArray(doc.sections) ? doc.sections : []
    checkUniqueIds(sections, `/sections`, errors)

    sections.forEach((sec, idx) => {
        if (!isObj(sec)) return
        const type = sec.type
        const data = sec.data
        switch (type) {
            case 'kanban':
                validateKanban(data, idx, errors)
                break
            case 'checklist':
                validateChecklist(data, idx, errors)
                break
            case 'notes':
                validateNotes(data, idx, errors)
                break
            case 'timeline':
                validateTimeline(data, idx, errors)
                break
            case 'table':
                validateTable(data, idx, errors)
                break
            case 'log':
                validateLog(data, idx, errors)
                break
            case 'metrics':
                validateMetrics(data, idx, errors)
                break
            case 'diagram':
                validateDiagram(data, idx, errors)
                break
            case 'report':
                validateReport(data, idx, errors)
                break
            case 'form':
                validateForm(data, idx, errors)
                break
            case 'links':
                validateLinks(data, idx, errors)
                break
            case 'references':
                validateReferences(data, idx, errors)
                break
            case 'family-graph':
                validateFamilyGraph(data, idx, errors)
                break
            default:
                // Extension section types (`x-<vendor>:<name>`) and unknown
                // bare types: no semantic check beyond the per-section id
                // uniqueness already covered by the /sections sweep.
                break
        }
    })

    return errors
}
