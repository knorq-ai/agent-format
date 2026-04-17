# @agent-format/mcp

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) server that renders [`.agent`](https://github.com/knorq-ai/agent-format) files as interactive dashboards **inline in the chat** of any MCP Apps–supporting client.

> Status: **Draft v0.1** — targets MCP Apps spec `2026-01-26`.

## What it does

When connected to Claude Desktop, ChatGPT (via Apps SDK), Cursor, VS Code Copilot, or Goose, this server exposes two tools:

- **`render_agent_file(path)`** — reads an `.agent` file from disk and renders it inline as a kanban / timeline / metrics / log / mindmap / etc. dashboard.
- **`render_agent_inline(data)`** — renders a full `.agent` JSON object that the agent just generated in this turn.

The rendered UI is the standard `.agent` viewer ([knorq-ai.github.io/agent-format](https://knorq-ai.github.io/agent-format/)) embedded in the chat. All 12 section types work.

## Install

```bash
npm install -g @agent-format/mcp
```

Or run without installing:

```bash
npx @agent-format/mcp
```

## Configure your client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on Windows:

```json
{
  "mcpServers": {
    "agent-format": {
      "command": "npx",
      "args": ["-y", "@agent-format/mcp"]
    }
  }
}
```

Restart Claude Desktop. The first time a tool runs, Claude will ask for permission.

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-format": {
      "command": "npx",
      "args": ["-y", "@agent-format/mcp"]
    }
  }
}
```

### VS Code Copilot Chat

Add to `settings.json`:

```json
{
  "mcp.servers": {
    "agent-format": {
      "command": "npx",
      "args": ["-y", "@agent-format/mcp"]
    }
  }
}
```

### ChatGPT (Apps SDK)

ChatGPT Apps are registered via the developer portal, not a local config file. The stdio pattern above targets desktop clients. For ChatGPT, package this server as an HTTP endpoint — a future release will include that entrypoint.

## Try it

After configuring a client and restarting:

> "Render `/Users/me/project.agent` as a dashboard."

Claude calls `render_agent_file`, the viewer opens inline, and you see the kanban / timeline / metrics.

Or inline:

> "Turn these TODOs into a kanban and render it."

Claude generates the `.agent` JSON, calls `render_agent_inline` with it, and the dashboard appears in the chat without touching disk.

## How it works

- The server is a stdio-based MCP server using `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`.
- Tools declare a shared UI resource URI `ui://agent-format/render.html`.
- The UI resource is a tiny HTML shell that iframes the deployed viewer at `knorq-ai.github.io/agent-format/` with the agent JSON encoded in the URL hash.
- CSP `frameDomains` allows that origin.
- When the tool result arrives via the MCP Apps `ui/notifications/tool-result` postMessage, the shell reads the `structuredContent.data` and points the iframe at the viewer.

This means the visual output is identical to what you'd see on the standalone viewer — same React renderer, same CSS — just embedded in the chat.

## Development

```bash
cd packages/mcp
npm install
npm run build
node dist/server.js
```

To test end-to-end locally, point your client's `command` at your absolute `dist/server.js` path instead of `npx`.

## License

MIT.
