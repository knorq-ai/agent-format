# @agent-format/mcp

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) server that renders [`.agent`](https://github.com/knorq-ai/agent-format) files as interactive dashboards **inline in the chat** of any MCP Apps–supporting client.

> Status: **Draft v0.1** — targets MCP Apps spec `2026-01-26`.

## What it does

When connected to Claude Desktop, ChatGPT (via Apps SDK), Cursor, VS Code Copilot, or Goose, this server exposes:

**Rendering tools**

- **`render_agent_file(path)`** — reads an `.agent` file from disk and renders it inline as a kanban / timeline / metrics / log / mindmap / etc. dashboard.
- **`render_agent_inline(data)`** — renders a full `.agent` JSON object that the agent just generated in this turn.

**Authoring skill** — the server also ships the authoring guide so the model learns when and how to emit `.agent` documents instead of HTML artifacts. Three discovery paths for maximum client compatibility:

- **`get_agent_format_skill(section?)`** tool — model-driven; works in every MCP client. Returns the main guide, the per-section data schemas, or worked examples.
- **Resources** at `agent-format://skill/{main,section-types,examples}` — auto-surfaced by clients that read resource lists.
- **`agent-format` prompt** — a slash-command in Claude Desktop / Cursor that injects the guide on demand.

The rendered UI is the standard `.agent` viewer ([knorq-ai.github.io/agent-format](https://knorq-ai.github.io/agent-format/)) embedded in the chat. All 13 section types work.

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

Claude calls `get_agent_format_skill` to learn the schema, generates the `.agent` JSON, calls `render_agent_inline`, and the dashboard appears in the chat without touching disk.

The round-trip:

> You drag a card in the rendered kanban and save. Next turn: "What moved?" Claude re-reads the file and sees your edit.

## How it works

- The server is a stdio-based MCP server using `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`.
- Tools declare a shared UI resource URI `ui://agent-format/render.html`.
- The UI resource is a single self-contained HTML document: the `@agent-format/renderer` React bundle and CSS are inlined at build time (see `build-ui.mjs`). No nested iframes, no external fetches, no CSP `frameDomains` required — the default sandbox is sufficient.
- When the tool result arrives via the MCP Apps `ui/notifications/tool-result` postMessage, the embedded script reads `structuredContent.data` and mounts `<AgentRenderer/>` against it directly.

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
