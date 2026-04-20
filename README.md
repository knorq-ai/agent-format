# Agent File Format

**A structured alternative to HTML for AI-generated visualizations — editable by the user, re-readable by the agent.**

> Status: **Draft v0.1** — not yet stable. Expect breaking changes until v1.0.
>
> **Note:** Not related to [`dotagent`](https://github.com/johnlindquist/dotagent) by @johnlindquist — that tool unifies IDE rule files (CLAUDE.md / `.cursorrules` / etc.). This spec defines a typed JSON artifact format for agent-rendered dashboards.

When you ask an AI to "turn this email into a kanban" or "visualize this PDF as a mindmap," today it writes hundreds of lines of HTML/CSS for something that should be a few dozen lines of data. The output is static, expensive to generate, and round-trip-lossy — drag a card and the agent can't re-read your edits.

`.agent` is a typed JSON artifact that:

1. **The agent writes as data** — tens of lines of JSON instead of hundreds of lines of HTML.
2. **Renders as a rich interactive UI** — kanban, timeline, mindmap, table, metrics, log, and more — via any conformant renderer.
3. **The user edits directly** — drag cards, inline text, no "copy and re-prompt."
4. **The agent re-reads next time** — changes persist; state survives across sessions.

Because the file is just JSON on disk, you can commit it to git, email it, share it between apps. The same artifact is the agent's output *and* the human's working surface.

---

## Why this exists

Today's AI products pick one of four shapes:

| Category | Example | What they miss |
|---|---|---|
| HTML artifacts | Claude Artifacts, ChatGPT Canvas | Static output, expensive to generate, round-trip-lossy — edits don't flow back to the agent |
| Generative UI | A2UI, MCP Apps | Transient per-response, not a portable file the user can keep |
| AI dashboards | Notion AI, OpenBB | Dashboard over external data, not an agent-authored artifact the agent can re-read |
| Agent memory infra | Letta `.af`, Mem0, Zep | No UI — memory is text/vectors the human doesn't see |

None of them ship the combination of **(a) portable file on disk** + **(b) closed-schema widgets the agent picks per concept** + **(c) rich rendered UI the user can edit** + **(d) round-trip back to the agent via re-read**.

That combination is what this spec defines.

---

## The shape, in 30 seconds

```json
{
  "version": "0.1",
  "name": "Product launch",
  "description": "Cross-functional launch tracker",
  "icon": "🚀",
  "createdAt": "2026-04-17T09:00:00.000Z",
  "updatedAt": "2026-04-17T09:00:00.000Z",
  "config": {
    "proactive": true,
    "customInstructions": "When I add a new risk, also create a mitigation task.",
    "tasks": [
      { "id": "t_1", "trigger": "daily", "prompt": "Summarize yesterday's movement." }
    ]
  },
  "sections": [
    {
      "id": "s_1", "type": "kanban", "label": "Workstreams", "order": 0,
      "data": {
        "columns": [
          { "id": "c_todo", "name": "To Do", "category": "todo", "order": 0 },
          { "id": "c_done", "name": "Done", "category": "done", "order": 1 }
        ],
        "items": [
          {
            "id": "i_1", "title": "Draft launch plan", "type": "task",
            "status": "c_todo", "priority": "p1", "labelIds": [], "blockedBy": [],
            "createdAt": "2026-04-17T09:00:00.000Z",
            "updatedAt": "2026-04-17T09:00:00.000Z"
          }
        ],
        "labels": []
      }
    }
  ],
  "memory": {
    "observations": [
      "The user prefers weekly updates on Fridays.",
      "Marketing sign-off is always the bottleneck for launches."
    ],
    "preferences": { "timezone": "Asia/Tokyo" }
  }
}
```

An agent reads this JSON. It sees *"this project has a kanban of workstreams, I remember these observations about the user."* It writes back changes to the same file. A human opens the same file in any conformant renderer and sees the rendered sections as an interactive dashboard.

---

## Supported section types

The core renderer defines 13 built-in section types, plus the deprecated `inheritance-diagram` alias and `x-<vendor>:<name>` extension sections. The agent chooses which section type fits a concept.

| Type | Use for |
|---|---|
| `kanban` | Tasks with status columns, labels, assignees, WIP limits |
| `checklist` | Grouped todo items |
| `notes` | Freeform markdown blocks |
| `timeline` | Items + milestones with start/end dates |
| `table` | Rows with typed columns (text, number, date, select, status) |
| `log` | Risks, assumptions, decisions, issues with severity |
| `metrics` | KPI cards with value, unit, trend |
| `diagram` | Nested hierarchy (mind map, org chart, breakdown) |
| `report` | Repeating markdown reports with a shared template |
| `form` | Input fields and submissions |
| `links` | External URLs grouped by category |
| `references` | Local file references (path + memo) |
| `family-graph` | Genealogy / inheritance / kinship diagrams |
| `inheritance-diagram` | Deprecated alias for `family-graph` |
| `x-<vendor>:<name>` | Vendor-defined extension sections rendered by plugins or fallback UI |

See [SPEC.md](./SPEC.md) for the full field list of each.

---

## Conformance

- **A writer** (agent or human) MUST produce files that validate against [`schemas/agent.schema.json`](./schemas/agent.schema.json).
- **A reader** SHOULD render unknown section types as a fallback (e.g. raw JSON), not error.
- **Breaking changes** bump the major version. v0.x is draft; breaking changes are allowed between 0.x releases.

See [SPEC.md](./SPEC.md) § Conformance for details.

---

## Live viewer

**https://knorq-ai.github.io/agent-format/** — drop any `.agent` file, paste JSON, or share via `?url=…` / `#{encoded-json}` URL. No install.

## Packages on npm

| Package | Install | Purpose |
|---|---|---|
| [`@agent-format/renderer`](https://www.npmjs.com/package/@agent-format/renderer) | `npm i @agent-format/renderer` | React component library that renders `.agent` data |
| [`@agent-format/mcp`](https://www.npmjs.com/package/@agent-format/mcp) | `npx @agent-format/mcp` | [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) server — renders `.agent` inline in Claude Desktop / ChatGPT / Cursor / VS Code Copilot / Goose |

## Reference implementation

This repository includes the reference implementation as a monorepo:

- **[`packages/renderer`](./packages/renderer)** — the React component library published as [`@agent-format/renderer`](https://www.npmjs.com/package/@agent-format/renderer).
- **[`packages/viewer`](./packages/viewer)** — the standalone web viewer deployed at the URL above.
- **[`packages/mcp`](./packages/mcp)** — the MCP Apps server published as [`@agent-format/mcp`](https://www.npmjs.com/package/@agent-format/mcp).
- **[`packages/claude-plugin`](./packages/claude-plugin)** — a Claude Code skill that teaches Claude to write `.agent` files instead of HTML artifacts when asked to visualize or structure content.

Want to add a second renderer (Obsidian plugin, VS Code extension, MCP Apps server)? See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Status and roadmap

- ✅ **v0.1 draft** (this repo) — 13 built-in section types, deprecated alias support, extension-section typing, JSON Schema, examples
- ⏳ **v0.2** — formalize extension mechanism (custom section types), stabilize ID conventions
- ⏳ **v0.3** — relations between sections (e.g. a `log` entry links to a `kanban` item)
- ⏳ **v1.0** — stable; breaking changes require major version bump

This is a draft spec from a single reference implementation. It is **not** yet widely adopted. If you're interested in a second renderer or want to propose changes, open an issue.

---

## License

Spec, schemas, and examples are licensed under [MIT](./LICENSE). You are free to build readers, writers, and derivative specs.
