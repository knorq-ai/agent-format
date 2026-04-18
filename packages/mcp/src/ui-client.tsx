// Runs inside the MCP Apps UI iframe. Renders the .agent data directly
// using the @agent-format/renderer React components — NO nested iframe,
// because Claude Desktop's sandbox CSP has no frame-src allowance.

import { App } from '@modelcontextprotocol/ext-apps'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AgentRenderer, type AgentFile } from '@agent-format/renderer'

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
                <AgentRenderer data={data as AgentFile} />
            </StrictMode>
        )
    } catch (e) {
        showEmpty('Failed to render: ' + String(e))
    }
}

const app = new App({ name: 'agent-format-renderer', version: '0.1.3' })

// Must be set BEFORE connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: {
    structuredContent?: { data?: unknown }
}) => {
    render(result?.structuredContent?.data)
}

app.connect()
