// Runs inside the MCP Apps UI iframe. Renders the .agent data directly
// using the @agent-format/renderer React components — NO nested iframe,
// because Claude Desktop's sandbox CSP has no frame-src allowance.

import { App } from '@modelcontextprotocol/ext-apps'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
    AgentRenderer,
    type AgentFile,
    type HostBridge,
    type RendererPlugin,
} from '@agent-format/renderer'
import { jpCourtPlugin } from '@agent-format/jp-court'

// Plugins we bundle into the MCP UI. Today: jp-court only, so `family-graph`
// sections with `variant: "jp-court"` get the 相続関係説明図 visual
// automatically inside Claude Desktop / Cursor / VS Code Copilot — no
// per-host setup required. Declared at module scope so React gets a stable
// reference across re-renders.
const BUNDLED_PLUGINS: ReadonlyArray<RendererPlugin> = [jpCourtPlugin]

let root: Root | null = null

function ensureRoot(): Root {
    const mount = document.getElementById('viewer')!
    if (!root) {
        root = createRoot(mount)
    }
    return root
}

function showEmpty(text: string) {
    const empty = document.getElementById('empty')
    if (empty) {
        empty.textContent = text
        empty.style.display = 'flex'
    }
    const mount = document.getElementById('viewer')
    if (mount) mount.style.display = 'none'
}

const app = new App({ name: 'agent-format-renderer', version: __APP_VERSION__ })

// Bridge from renderer's generic HostBridge interface to the MCP Apps SDK.
// The sandbox blocks window.open() and anchor downloads directly; the app
// API routes these through the host (Claude Desktop / Cursor / etc.) which
// prompts the user and opens a real browser tab / saves a real file.
const hostBridge: HostBridge = {
    openLink: async (url: string) => {
        const { isError } = await app.openLink({ url })
        return !isError
    },
    downloadFile: async ({ mimeType, text, blobBase64, filename }) => {
        // Prefer text when provided (HTML/JSON/CSV). Use blob (base64) for
        // binary payloads. The SDK types resource as a discriminated union
        // so build each branch separately rather than mutating a shared object.
        const uri = `file:///${filename}`
        const resource =
            typeof text === 'string'
                ? { uri, mimeType, text }
                : typeof blobBase64 === 'string'
                    ? { uri, mimeType, blob: blobBase64 }
                    : null
        if (!resource) return false
        const { isError } = await app.downloadFile({
            contents: [{ type: 'resource', resource }],
        })
        return !isError
    },
}

function render(data: unknown) {
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { sections?: unknown }).sections)
    ) {
        showEmpty('No valid .agent data received.')
        return
    }
    try {
        const empty = document.getElementById('empty')
        if (empty) empty.style.display = 'none'
        const mount = document.getElementById('viewer')!
        mount.style.display = 'block'

        ensureRoot().render(
            <StrictMode>
                <AgentRenderer
                    data={data as AgentFile}
                    host={hostBridge}
                    plugins={BUNDLED_PLUGINS}
                />
            </StrictMode>
        )
    } catch (e) {
        showEmpty('Failed to render: ' + String(e))
    }
}

// Must be set BEFORE connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: {
    structuredContent?: { data?: unknown }
}) => {
    render(result?.structuredContent?.data)
}

app.connect()
