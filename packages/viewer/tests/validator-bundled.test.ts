// Regression test for the CJS-interop bug that produced `P is not a function`
// (minified `func2 is not a function`) in the deployed viewer.
//
// The plain vitest test validates `src/validator.ts` under Node's native
// ESM-from-CJS interop, which exposes named exports directly. The viewer ships
// through Vite, which uses esbuild's `__toESM(mod, 1)` (Node-compat) wrapper —
// that sets `ns.default = module.exports`, one level deeper than Node's own
// interop. The original bug only surfaced there, so this test bundles the
// generated validator through esbuild with the same settings Vite uses and
// asserts it stays callable end-to-end.
import { describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

async function runBundledValidator(fixture: string): Promise<{
    ok: boolean
    errors?: unknown
    thrown?: string
}> {
    const workDir = mkdtempSync(resolve(tmpdir(), 'agent-validator-'))
    const validatorPath = resolve(
        process.cwd(),
        'packages/viewer/src/generated/agent-validator.js'
    )
    const fixtureData = readFileSync(resolve(process.cwd(), fixture), 'utf8')
    // Sanity-check that the fixture itself is valid JSON before we inline it;
    // a malformed fixture would otherwise surface as a confusing parser error
    // inside the bundled entry.
    JSON.parse(fixtureData)
    const entryPath = resolve(workDir, 'entry.mjs')
    const outPath = resolve(workDir, 'bundle.mjs')
    // The entry imports the generated validator and prints a JSON verdict to
    // stdout. We run the bundle in a child process so vitest's own module
    // resolver doesn't interfere with the `file://` import. The fixture is
    // inlined because esbuild's `platform: "browser"` does not resolve
    // `node:fs`.
    writeFileSync(
        entryPath,
        [
            `import validate from ${JSON.stringify(validatorPath)};`,
            `const data = ${fixtureData};`,
            `try {`,
            `    const ok = validate(data);`,
            `    process.stdout.write(JSON.stringify({ ok, errors: validate.errors ?? null }));`,
            `} catch (err) {`,
            `    process.stdout.write(JSON.stringify({ ok: false, thrown: err instanceof Error ? err.message : String(err) }));`,
            `}`,
        ].join('\n')
    )
    await build({
        entryPoints: [entryPath],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: outPath,
        resolveExtensions: ['.mjs', '.js'],
        absWorkingDir: process.cwd(),
        mainFields: ['browser', 'module', 'main'],
        conditions: ['browser', 'import', 'default'],
        logLevel: 'silent',
    })
    const result = spawnSync(process.execPath, [outPath], {
        encoding: 'utf8',
        timeout: 20_000,
    })
    if (result.status !== 0) {
        return {
            ok: false,
            thrown: result.stderr.trim() || `exit ${result.status}`,
        }
    }
    return JSON.parse(result.stdout)
}

describe('viewer validator (esbuild-bundled)', () => {
    it('stays callable under esbuild Node-compat CJS interop (minimal)', async () => {
        const verdict = await runBundledValidator('examples/minimal.agent')
        expect(verdict.thrown).toBeUndefined()
        expect(verdict.ok).toBe(true)
    }, 30_000)

    it('stays callable for jp-court fixtures with date-time + uri formats', async () => {
        const verdict = await runBundledValidator(
            'examples/inheritance-jp-3gen.agent'
        )
        expect(verdict.thrown).toBeUndefined()
        expect(verdict.ok).toBe(true)
    }, 30_000)
})
