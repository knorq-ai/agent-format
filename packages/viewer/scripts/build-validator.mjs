#!/usr/bin/env node
// Pre-compile the .agent JSON Schema into a standalone ES module so the
// browser viewer doesn't need runtime `new Function(...)` code generation.
// Ajv's default compile path uses eval, which the viewer's strict CSP
// (`script-src 'self'`) refuses — that made the module throw at import
// time and left the page blank. `ajv/dist/standalone` emits pure code
// we can bundle directly; no eval, CSP stays tight.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Ajv2020 = require('ajv/dist/2020').default
const addFormats = require('ajv-formats').default
const standaloneCode = require('ajv/dist/standalone').default

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const schemaPath = resolve(repoRoot, 'schemas/agent.schema.json')
const outDir = resolve(here, '../src/generated')
const outPath = resolve(outDir, 'agent-validator.js')

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const ajv = new Ajv2020({
    code: { source: true, esm: true },
    allErrors: true,
    strict: false,
})
addFormats(ajv)
const validate = ajv.compile(schema)
const code = standaloneCode(ajv, validate)

// ajv-standalone's `esm: true` controls only the top-level export syntax —
// internal references to format helpers and the ucs2length runtime are
// still emitted as CommonJS `require(...)` calls, which the browser can't
// resolve. Rewrite them into ESM imports hoisted to the top of the file so
// the module loads under the viewer's strict CSP.
const esmImports = new Map([
    ['ajv/dist/runtime/ucs2length', '__ucs2lengthImport'],
    ['ajv-formats/dist/formats', '__ajvFormatsImport'],
])
let rewritten = code
for (const [mod, local] of esmImports) {
    const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // `require("mod").default` → `__mod.default`, `require("mod").x.y` → `__mod.x.y`
    rewritten = rewritten.replace(
        new RegExp(`require\\("${escaped}"\\)`, 'g'),
        local
    )
}
const importBlock = [...esmImports.entries()]
    .map(([mod, local]) => `import * as ${local} from "${mod}";`)
    .join('\n')
const interopBlock = [
    // Ajv standalone emits CommonJS helper references. Under Vite's ESM +
    // CommonJS interop, these helpers may surface as nested `default.default`
    // objects instead of the callable/value the generated code expects.
    // Normalize both modules once here so the generated validator stays stable
    // in browser bundles and in tests.
    'const __ucs2length = typeof __ucs2lengthImport.default === "function"',
    '    ? __ucs2lengthImport.default',
    '    : typeof __ucs2lengthImport.default?.default === "function"',
    '        ? __ucs2lengthImport.default.default',
    '        : __ucs2lengthImport.default ?? __ucs2lengthImport;',
    'const __ajvFormats = __ajvFormatsImport.fullFormats',
    '    ? __ajvFormatsImport',
    '    : __ajvFormatsImport.default?.fullFormats',
    '        ? __ajvFormatsImport.default',
    '        : __ajvFormatsImport.default ?? __ajvFormatsImport;',
].join('\n')

mkdirSync(outDir, { recursive: true })
const banner =
    '// GENERATED — do not edit. Produced by scripts/build-validator.mjs from\n' +
    '// schemas/agent.schema.json. Re-run `npm run build:validator` to refresh.\n' +
    '/* eslint-disable */\n'
writeFileSync(outPath, banner + importBlock + '\n' + interopBlock + '\n' + rewritten, 'utf8')
process.stderr.write(`wrote ${outPath} (${code.length} bytes)\n`)
