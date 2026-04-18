// Runs inside the MCP Apps UI iframe. Uses the official
// @modelcontextprotocol/ext-apps client to handshake with the host and
// receive tool results; frames the deployed viewer with the data.

import { App } from '@modelcontextprotocol/ext-apps'

const VIEWER_BASE = 'https://knorq-ai.github.io/agent-format/'

function render(data: unknown) {
    const empty = document.getElementById('empty')!
    const viewer = document.getElementById('viewer') as HTMLIFrameElement

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { sections?: unknown }).sections)
    ) {
        empty.textContent = 'No valid .agent data received.'
        return
    }

    try {
        const hash = encodeURIComponent(JSON.stringify(data))
        viewer.src = VIEWER_BASE + '#' + hash
        viewer.style.display = 'block'
        empty.style.display = 'none'
    } catch (e) {
        empty.textContent = 'Failed to render: ' + String(e)
    }
}

const app = new App({ name: 'agent-format-renderer', version: '0.1.0' })

// Must be set BEFORE connect() so we don't miss the initial tool-result.
app.ontoolresult = (result: {
    structuredContent?: { data?: unknown }
    content?: Array<{ type: string; text?: string }>
}) => {
    const data = result?.structuredContent?.data
    render(data)
}

app.connect()
