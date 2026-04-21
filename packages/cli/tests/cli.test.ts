// End-to-end: compiles the CLI, runs it against the repo's example files
// (expect pass) and crafted negative fixtures (expect fail). This both
// exercises the CLI binary and — because the CLI uses its own Ajv instance
// against the shared schema — serves as a cross-check on the renderer's
// interpretation of the format.
import { describe, expect, it, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const CLI = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js')
const EXAMPLES = path.join(REPO_ROOT, 'examples')

function run(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
        const stdout = execFileSync('node', [CLI, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { status: 0, stdout, stderr: '' }
    } catch (e) {
        const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer }
        return {
            status: err.status ?? 1,
            stdout: err.stdout?.toString() ?? '',
            stderr: err.stderr?.toString() ?? '',
        }
    }
}

describe('@agent-format/cli', () => {
    beforeAll(() => {
        if (!fs.existsSync(CLI)) {
            throw new Error(
                `CLI binary missing at ${CLI}. Run \`npm run build -w @agent-format/cli\` before tests.`
            )
        }
    })

    it('prints --help without erroring', () => {
        const r = run(['--help'])
        expect(r.status).toBe(0)
        expect(r.stdout).toContain('Usage: agent-format')
    })

    it('exit 2 when called with no files', () => {
        const r = run([])
        expect(r.status).toBe(2)
    })

    it('validates all committed examples', () => {
        const files = fs
            .readdirSync(EXAMPLES)
            .filter((f) => f.endsWith('.agent'))
            .map((f) => path.join(EXAMPLES, f))
        expect(files.length).toBeGreaterThan(0)
        const r = run(files)
        if (r.status !== 0) {
            throw new Error(`expected 0 exit, got ${r.status}\n${r.stderr}`)
        }
        expect(r.stdout).toContain('✓')
    })

    it('rejects a malformed agent file', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'bad.agent')
        // Missing required `sections` / `memory` / `config`.
        fs.writeFileSync(bad, JSON.stringify({ version: '0.1', name: 'x' }))
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('✗')
    })

    it('rejects a file with the wrong extension', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const wrongExt = path.join(tmp, 'file.json')
        fs.writeFileSync(wrongExt, JSON.stringify({}))
        const r = run([wrongExt])
        expect(r.status).toBe(1)
        expect(r.stderr.toLowerCase()).toContain('wrong extension')
    })

    it('reports filesystem errors (EISDIR) distinctly from JSON parse errors', () => {
        // Passing a directory used to surface as "not valid JSON — EISDIR:
        // illegal operation on a directory", which sent users hunting for
        // a syntax bug that doesn't exist. The error must say "cannot read".
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const dir = path.join(tmp, 'not-a-file.agent')
        fs.mkdirSync(dir)
        const r = run([dir])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('cannot read')
        expect(r.stderr).not.toContain('not valid JSON')
    })

    it('rejects invalid JSON with a non-crash error', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'bad.agent')
        fs.writeFileSync(bad, '{not json')
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('not valid JSON')
    })

    it('rejects unknown bare section type (enforces x-<vendor>:<name>)', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'custom.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 's1',
                        type: 'made-up-widget',
                        label: 'x',
                        order: 0,
                        data: {},
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
    })

    it('rejects duplicate section ids (semantic pass)', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'dup-sections.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    { id: 's1', type: 'notes', label: 'a', order: 0, data: { blocks: [] } },
                    { id: 's1', type: 'notes', label: 'b', order: 1, data: { blocks: [] } },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('semantic')
        expect(r.stderr).toContain('duplicate id "s1"')
    })

    it('rejects kanban item status pointing at unknown column (semantic)', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'kanban-bad.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 's',
                        type: 'kanban',
                        label: 'k',
                        order: 0,
                        data: {
                            columns: [
                                { id: 'todo', name: 'To Do', category: 'active', order: 0 },
                            ],
                            items: [
                                {
                                    id: 'i1',
                                    title: 't',
                                    type: 'task',
                                    status: 'ghost-column',
                                    priority: 'low',
                                    labelIds: ['no-such-label'],
                                    blockedBy: ['missing-item'],
                                    createdAt: '2026-04-20T00:00:00Z',
                                    updatedAt: '2026-04-20T00:00:00Z',
                                },
                            ],
                            labels: [],
                        },
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('status "ghost-column"')
        expect(r.stderr).toContain('labelId "no-such-label"')
        expect(r.stderr).toContain('blockedBy "missing-item"')
    })

    it('rejects table status cell that is not { state, comment? }', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'table-bad.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 's',
                        type: 'table',
                        label: 't',
                        order: 0,
                        data: {
                            columns: [
                                { key: 'name', label: 'N', type: 'text' },
                                { key: 'ship', label: 'S', type: 'status' },
                            ],
                            rows: [
                                { name: 'row1', ship: 'done' }, // plain string, not {state}
                                { name: 'row2', ship: { state: 'bogus' } }, // invalid enum
                            ],
                        },
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('status cell must be an object')
    })

    it('rejects family-graph relationship pointing at unknown person', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'fg-bad.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 'fg',
                        type: 'family-graph',
                        label: 'f',
                        order: 0,
                        data: {
                            persons: [{ id: 'p1', name: 'A' }],
                            relationships: [
                                { type: 'parent-child', person1Id: 'p1', person2Id: 'ghost' },
                            ],
                        },
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('"ghost"')
    })

    it('caps pathologically deep diagram nesting without crashing', () => {
        // 512 is 2× the cap (well past the guard) while still stringifying
        // without hitting V8's JSON.stringify recursion limit (~4096), so
        // the fixture itself can be serialized to disk. Deeper attacker
        // payloads emitted as raw JSON strings trip the same depth guard.
        const root: { id: string; label: string; children: unknown[] } = {
            id: 'n0',
            label: 'root',
            children: [],
        }
        let cur = root
        for (let i = 1; i < 512; i++) {
            const child = { id: `n${i}`, label: `n${i}`, children: [] as unknown[] }
            cur.children.push(child)
            cur = child
        }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'deep.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 'd',
                        type: 'diagram',
                        label: 'deep',
                        order: 0,
                        data: { root },
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('diagram nesting exceeds')
    })

    it('CLI semantic.ts stays byte-identical with renderer validate.ts', () => {
        // The CLI keeps its own copy of the semantic validator on purpose
        // (the CLI is the documented "independent second implementation"
        // of the spec). But silent drift would make the two validators
        // disagree, which is worse than either choice alone. Compare
        // file contents directly and fail loudly if they drift.
        const cliPath = path.join(REPO_ROOT, 'packages/cli/src/semantic.ts')
        const renderPath = path.join(REPO_ROOT, 'packages/renderer/src/validate.ts')
        const cli = fs.readFileSync(cliPath, 'utf8')
        const render = fs.readFileSync(renderPath, 'utf8')
        expect(cli).toBe(render)
    })

    it('emits RFC 6901 JSON Pointers (no bracket indices) for semantic errors', () => {
        // jq/awk tooling and Ajv errors both use `/items/2/field`. Semantic
        // errors must match so downstream tools can filter uniformly.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'path-shape.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 's',
                        type: 'kanban',
                        label: 'k',
                        order: 0,
                        data: {
                            columns: [{ id: 'todo', name: 'T', category: 'a', order: 0 }],
                            items: [
                                {
                                    id: 'i1',
                                    title: 't',
                                    type: 'task',
                                    status: 'ghost',
                                    priority: 'low',
                                    labelIds: [],
                                    blockedBy: [],
                                    createdAt: '2026-04-20T00:00:00Z',
                                    updatedAt: '2026-04-20T00:00:00Z',
                                },
                            ],
                            labels: [],
                        },
                    },
                ],
            })
        )
        const r = run([bad])
        expect(r.status).toBe(1)
        // Path must use `/items/0/status`, not `/items[0]/status`.
        expect(r.stderr).toContain('/sections/0/data/items/0/status')
        expect(r.stderr).not.toMatch(/items\[\d+\]/)
    })

    it('--skip-semantic passes a doc that only fails semantic checks', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const bad = path.join(tmp, 'skip.agent')
        fs.writeFileSync(
            bad,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    { id: 's1', type: 'notes', label: 'a', order: 0, data: { blocks: [] } },
                    { id: 's1', type: 'notes', label: 'b', order: 1, data: { blocks: [] } },
                ],
            })
        )
        expect(run([bad]).status).toBe(1)
        expect(run(['--skip-semantic', bad]).status).toBe(0)
    })

    it('accepts x-<vendor>:<name> extension section (§ 7.2)', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-'))
        const ok = path.join(tmp, 'ext.agent')
        fs.writeFileSync(
            ok,
            JSON.stringify({
                version: '0.1',
                name: 'x',
                createdAt: '2026-04-20T00:00:00Z',
                updatedAt: '2026-04-20T00:00:00Z',
                config: { proactive: false },
                memory: { observations: [], preferences: {} },
                sections: [
                    {
                        id: 's1',
                        type: 'x-acme:burndown',
                        label: 'Burndown',
                        order: 0,
                        data: { any: 'shape' },
                    },
                ],
            })
        )
        const r = run([ok])
        expect(r.status).toBe(0)
    })
})
