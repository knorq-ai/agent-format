// Bundles src/ui-client.tsx + @agent-format/renderer + React into a
// browser-ready IIFE, writes it to dist/ui-client.js. Also copies the
// renderer's styles.css to dist/ui-styles.css so the server can inline
// both into the UI HTML.
import esbuild from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Read the package version from our own package.json so the App version
// reported to the MCP Apps host matches the published npm version exactly.
// Avoids the prior foot-gun of a hand-edited string in ui-client.tsx drifting
// behind package.json after a release bump.
const pkg = JSON.parse(
    await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')
)

const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/ui-client.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    jsx: 'automatic',
    outfile: path.join(__dirname, 'dist/ui-client.js'),
    define: {
        'process.env.NODE_ENV': '"production"',
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    logLevel: 'info',
})

if (result.errors.length > 0) {
    console.error(result.errors)
    process.exit(1)
}

// The renderer exposes its CSS via the `./styles.css` export — resolve
// it through Node's module resolution so we find it whether hoisted to
// the workspace root or installed locally.
const rendererCssPath = require.resolve('@agent-format/renderer/styles.css')
const css = await fs.readFile(rendererCssPath, 'utf8')
await fs.writeFile(path.join(__dirname, 'dist/ui-styles.css'), css)
console.log(`Copied renderer styles: ${css.length} bytes`)
