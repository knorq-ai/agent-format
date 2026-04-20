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
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
// ajv and ajv-formats ship CJS defaults; NodeNext ESM resolution surfaces
// them via `.default`. Use createRequire to reach the runtime constructor
// without fighting the type system.
import { createRequire } from 'node:module'
const requireCjs = createRequire(import.meta.url)
const Ajv2020: new (opts?: unknown) => {
    compile: (schema: unknown) => ValidateFunction
} = requireCjs('ajv/dist/2020').default
const addFormats: (ajv: unknown) => void = requireCjs('ajv-formats').default
interface ValidateFunction {
    (data: unknown): boolean
    errors?: { instancePath?: string; message?: string }[] | null
}
import { isAgentLike, resolveAgentFile } from './resolve.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Single source of truth for name/version so serverInfo can't drift from the
// published package. package.json is two levels up from dist/server.js.
const pkg = JSON.parse(
    fsSync.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
) as { name: string; version: string }

const UI_URI = 'ui://agent-format/render.html'

// Produced by `node build-ui.mjs` — bundles ext-apps client + React +
// @agent-format/renderer into a single IIFE, plus the renderer's CSS.
const UI_CLIENT_JS = fsSync.readFileSync(path.join(__dirname, 'ui-client.js'), 'utf8')
const UI_STYLES_CSS = fsSync.readFileSync(path.join(__dirname, 'ui-styles.css'), 'utf8')

// JSON Schema for full-document validation of inline payloads. Copied from
// schemas/agent.schema.json at build time (see tsconfig `resolveJsonModule`).
// We compile once at startup; validation is a hot path on every tool call.
const agentSchema = JSON.parse(
    fsSync.readFileSync(path.join(__dirname, 'agent.schema.json'), 'utf8')
)
// allErrors: true — so `summarizeAjvErrors` can pick the most informative
// of several parallel failures (e.g. a single bad section triggers both a
// `const` mismatch on `type` and a `oneOf` failure at the parent array).
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateAgent = ajv.compile(agentSchema)

function summarizeAjvErrors(errs: ValidateFunction['errors']): string {
    if (!errs || errs.length === 0) return 'unknown validation failure'
    // Return the first two errors only — full dumps are noisy for model consumption.
    return errs
        .slice(0, 2)
        .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
        .join('; ')
}

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
    name: pkg.name,
    version: pkg.version,
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
        try {
            const result = await resolveAgentFile(filePath)
            if (!result.ok) {
                return {
                    content: [{ type: 'text', text: result.message }],
                    isError: true,
                }
            }
            return {
                content: [{ type: 'text', text: result.message }],
                structuredContent: { data: result.data } as Record<string, unknown>,
            }
        } catch (err) {
            // Log the raw error to stderr for the operator; return a generic
            // message to the model so error-surface doesn't leak filesystem
            // internals (e.g. symlink target paths in ENOENT strings).
            console.error('render_agent_file error:', err)
            return {
                content: [{ type: 'text', text: `Failed to read .agent file.` }],
                isError: true,
            }
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
        if (!isAgentLike(data)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'The `data` argument is not a valid .agent document (missing or non-array `sections`).',
                    },
                ],
                isError: true,
            }
        }
        // Full JSON-Schema validation: reject malformed documents up front so
        // the UI iframe never tries to render garbage. Keep the message short
        // (first couple of errors) so models can self-correct without a flood.
        if (!validateAgent(data)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Invalid .agent document: ${summarizeAjvErrors(validateAgent.errors)}`,
                    },
                ],
                isError: true,
            }
        }
        const name = typeof data.name === 'string' ? data.name : 'agent data'
        return {
            content: [
                { type: 'text', text: `Rendering "${name}" (${data.sections.length} sections) inline.` },
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
            'Inline React renderer for .agent files. Receives the tool result via the ext-apps postMessage bridge and mounts <AgentRenderer/> against the supplied data.',
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
