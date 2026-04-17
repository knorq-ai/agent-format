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
import * as path from 'node:path'

const VIEWER_BASE = 'https://knorq-ai.github.io/agent-format/'
const VIEWER_ORIGIN = 'https://knorq-ai.github.io'
const UI_URI = 'ui://agent-format/render.html'

const RENDER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Agent renderer</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #fff; color: #1a1a1a; }
  iframe { width: 100%; height: 100vh; border: 0; display: block; }
  .empty {
    display: flex; align-items: center; justify-content: center;
    height: 100vh; font: 14px -apple-system, system-ui, "Segoe UI", sans-serif;
    color: #6b7280; padding: 24px; text-align: center;
  }
  @media (prefers-color-scheme: dark) {
    html, body { background: #0f1115; color: #e5e7eb; }
    .empty { color: #9ca3af; }
  }
</style>
</head>
<body>
<div id="empty" class="empty">Waiting for data…</div>
<iframe id="viewer" style="display:none"></iframe>
<script>
(function () {
  var viewerBase = ${JSON.stringify(VIEWER_BASE)};
  var viewer = document.getElementById('viewer');
  var empty = document.getElementById('empty');

  function render(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.sections)) {
      empty.textContent = 'No valid .agent data received.';
      return;
    }
    try {
      var hash = encodeURIComponent(JSON.stringify(data));
      viewer.src = viewerBase + '#' + hash;
      viewer.style.display = 'block';
      empty.style.display = 'none';
    } catch (e) {
      empty.textContent = 'Failed to render: ' + String(e);
    }
  }

  // MCP Apps initialize
  try {
    window.parent.postMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
        clientInfo: { name: 'agent-format-renderer', version: '0.1.0' }
      }
    }, '*');
  } catch (_) { /* non-MCP host; ignore */ }

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.method === 'ui/notifications/tool-result') {
      var sc = msg.params && msg.params.structuredContent;
      var data = sc && sc.data;
      render(data);
    }
  });
})();
</script>
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
            'Read an .agent file from disk and render it as an interactive dashboard (kanban / timeline / metrics / log / etc.) inline in the chat.',
        inputSchema: {
            path: z.string().describe('Absolute path to the .agent file on the local filesystem.'),
        },
        _meta: { ui: { resourceUri: UI_URI, visibility: ['model', 'app'] } },
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
            'Render an .agent JSON object (passed as the `data` argument) as an interactive dashboard inline in the chat. Use when you generated the data this turn and want to show it without saving to disk.',
        inputSchema: {
            data: z
                .unknown()
                .describe(
                    'The complete .agent document as a JSON object. Must match the v0.1 schema: { version, name, createdAt, updatedAt, config, sections[], memory }.',
                ),
        },
        _meta: { ui: { resourceUri: UI_URI, visibility: ['model', 'app'] } },
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
                        csp: {
                            frameDomains: [VIEWER_ORIGIN],
                            resourceDomains: [],
                            connectDomains: [],
                            baseUriDomains: [],
                        },
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
