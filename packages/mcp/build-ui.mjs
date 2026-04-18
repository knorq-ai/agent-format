// Bundles src/ui-client.ts into a browser-ready IIFE, then writes it
// to dist/ui-client.js so the server can inline it into the UI HTML.
import esbuild from 'esbuild'

const result = await esbuild.build({
    entryPoints: ['src/ui-client.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    outfile: 'dist/ui-client.js',
    logLevel: 'info',
})

if (result.errors.length > 0) {
    console.error(result.errors)
    process.exit(1)
}
