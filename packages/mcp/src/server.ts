#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    registerAppTool,
    registerAppResource,
    RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const UI_URI = 'ui://agent-format/render.html'

// Produced by `node build-ui.mjs` — bundles ext-apps client + React +
// @agent-format/renderer into a single IIFE, plus the renderer's CSS.
const UI_CLIENT_JS = fsSync.readFileSync(path.join(__dirname, 'ui-client.js'), 'utf8')
const UI_STYLES_CSS = fsSync.readFileSync(path.join(__dirname, 'ui-styles.css'), 'utf8')

const RENDER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Agent renderer</title>
<style>
  html, body { margin: 0; padding: 0; min-height: 100%; }
  #viewer { display: none; }
  #empty {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; font: 14px -apple-system, system-ui, "Segoe UI", sans-serif;
    color: var(--af-fg-muted, #6b7280); padding: 24px; text-align: center;
  }
</style>
<style>${UI_STYLES_CSS}</style>
</head>
<body>
<div id="empty">Waiting for data…</div>
<div id="viewer"></div>
<script>${UI_CLIENT_JS}</script>
</body>
</html>`

const server = new McpServer({
    name: '@agent-format/mcp',
    version: '0.1.0',
})

registerAppTool(
    server,
    'render_agent_file',
    {
        title: 'Render .agent file',
        description:
            'USE THIS TOOL whenever the user asks to render, view, show, display, open, or visualize an .agent file. ' +
            'This is the ONLY way to produce an interactive visual dashboard from an .agent file — without this tool ' +
            'the user will only see raw JSON text. The output renders inline in the chat with styled kanban boards, ' +
            'timelines, metric cards, checklists, log entries, mind-map diagrams, and tables — whichever section ' +
            'types the file contains. DO NOT use the built-in Read tool for .agent files; DO NOT generate an HTML ' +
            'artifact. Call this tool with the absolute path and the UI will appear automatically.',
        inputSchema: {
            path: z.string().describe('Absolute path to the .agent file on the local filesystem.'),
        },
        _meta: { ui: { resourceUri: UI_URI } },
    },
    async ({ path: filePath }): Promise<CallToolResult> => {
        const resolved = path.resolve(filePath)
        const text = await fs.readFile(resolved, 'utf8')
        const data: unknown = JSON.parse(text)
        const sectionCount =
            data && typeof data === 'object' && 'sections' in data && Array.isArray((data as { sections: unknown[] }).sections)
                ? (data as { sections: unknown[] }).sections.length
                : 0
        return {
            content: [
                {
                    type: 'text',
                    text: `Loaded ${path.basename(resolved)} (${sectionCount} sections). Rendering inline.`,
                },
            ],
            structuredContent: { data } as Record<string, unknown>,
        }
    },
)

registerAppTool(
    server,
    'render_agent_inline',
    {
        title: 'Render .agent inline',
        description:
            'USE THIS TOOL to display an .agent JSON object you generated this turn as an interactive visual dashboard ' +
            'inline in the chat. Pass the full .agent document as the `data` argument. This is the ONLY way to render ' +
            'generated .agent data visually — without this tool the user will only see raw JSON text. DO NOT generate ' +
            'an HTML artifact or return the JSON in a code block; call this tool and the UI will appear.',
        inputSchema: {
            data: z
                .unknown()
                .describe(
                    'The complete .agent document as a JSON object. Must match the v0.1 schema: { version, name, createdAt, updatedAt, config, sections[], memory }.',
                ),
        },
        _meta: { ui: { resourceUri: UI_URI } },
    },
    async ({ data }): Promise<CallToolResult> => {
        const name =
            data && typeof data === 'object' && 'name' in data && typeof (data as { name: unknown }).name === 'string'
                ? ((data as { name: string }).name)
                : 'agent data'
        const sectionCount =
            data && typeof data === 'object' && 'sections' in data && Array.isArray((data as { sections: unknown[] }).sections)
                ? (data as { sections: unknown[] }).sections.length
                : 0
        return {
            content: [
                { type: 'text', text: `Rendering "${name}" (${sectionCount} sections) inline.` },
            ],
            structuredContent: { data } as Record<string, unknown>,
        }
    },
)

registerAppResource(
    server,
    'Agent renderer',
    UI_URI,
    {
        description:
            'Renders .agent data as an interactive dashboard by framing the knorq-ai.github.io viewer with the data passed via the tool-result message bridge.',
    },
    async (): Promise<ReadResourceResult> => ({
        contents: [
            {
                uri: UI_URI,
                mimeType: RESOURCE_MIME_TYPE,
                text: RENDER_HTML,
                _meta: {
                    ui: {
                        // Everything (React, renderer, CSS) is inlined into
                        // the HTML — no external fetches, no nested iframes.
                        // Default CSP is sufficient.
                        prefersBorder: false,
                    },
                },
            },
        ],
    }),
)

async function main(): Promise<void> {
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main().catch((err) => {
    console.error('agent-format MCP server error:', err)
    process.exit(1)
})
