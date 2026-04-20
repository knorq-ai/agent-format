// Build-time constant injected by build-ui.mjs via esbuild `define`.
// Sourced from packages/mcp/package.json so the MCP App version stays in
// lockstep with the npm package — no hand-edits, no drift.
declare const __APP_VERSION__: string
