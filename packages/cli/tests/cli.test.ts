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
