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
//
// The rewrite swaps each known `require("mod")[...suffix]` pattern with a
// normalized alias that matches the exact shape the generated code expects.
// This matters because esbuild's `__toESM(..., 1)` (Node-compat) interop sets
// `ns.default = module.exports`, so naively substituting `require("m")` with
// the namespace `ns` would land on `ns.default.prop` instead of `exports.prop`
// — turning `func2 = require("ucs2length").default` into the CJS exports
// object rather than the ucs2length function. AJV standalone only emits three
// reference shapes, so we rewrite each one explicitly and define matching
// aliases below.
const namespaceImports = new Map([
    ['ajv/dist/runtime/ucs2length', '__ucs2lengthImport'],
    ['ajv-formats/dist/formats', '__ajvFormatsImport'],
])
const referenceRewrites = [
    // `require("…/ucs2length").default` is the ucs2length function itself.
    {
        pattern: /require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g,
        replacement: '__ucs2length',
    },
    // `require("ajv-formats/dist/formats")` resolves to the CJS exports
    // namespace (with `.fullFormats`, `.fastFormats`, etc. attached).
    {
        pattern: /require\("ajv-formats\/dist\/formats"\)/g,
        replacement: '__ajvFormats',
    },
]
let rewritten = code
for (const { pattern, replacement } of referenceRewrites) {
    rewritten = rewritten.replace(pattern, replacement)
}
const importBlock = [...namespaceImports.entries()]
    .map(([mod, local]) => `import * as ${local} from "${mod}";`)
    .join('\n')
const interopBlock = [
    // Normalize esbuild/Vite CJS interop shapes. The generated code references
    // `__ucs2length` (expected to be the function) and `__ajvFormats` (expected
    // to be the CJS exports namespace that exposes `.fullFormats`). Under
    // esbuild's Node-compat `__toESM` wrapper, the bare ESM namespace object
    // puts the real values one level deep inside `.default`; unwrap that.
    'const __ucs2length = (() => {',
    '    const ns = __ucs2lengthImport;',
    '    if (typeof ns === "function") return ns;',
    '    if (ns && typeof ns.default === "function") return ns.default;',
    '    if (ns && ns.default && typeof ns.default.default === "function") return ns.default.default;',
    '    throw new Error("agent-format viewer: ucs2length runtime helper missing");',
    '})();',
    'const __ajvFormats = (() => {',
    '    const ns = __ajvFormatsImport;',
    '    if (ns && ns.fullFormats) return ns;',
    '    if (ns && ns.default && ns.default.fullFormats) return ns.default;',
    '    throw new Error("agent-format viewer: ajv-formats runtime helper missing");',
    '})();',
].join('\n')

mkdirSync(outDir, { recursive: true })
const banner =
    '// GENERATED — do not edit. Produced by scripts/build-validator.mjs from\n' +
    '// schemas/agent.schema.json. Re-run `npm run build:validator` to refresh.\n' +
    '/* eslint-disable */\n'
writeFileSync(outPath, banner + importBlock + '\n' + interopBlock + '\n' + rewritten, 'utf8')
process.stderr.write(`wrote ${outPath} (${code.length} bytes)\n`)
