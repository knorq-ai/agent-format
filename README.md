# Agent File Format

**A portable file format for the visual memory of an AI agent.**

> Status: **Draft v0.1** — not yet stable. Expect breaking changes until v1.0.

An `.agent.json` file is a single portable artifact that contains **both**:

1. **What the agent knows** — structured data the agent stores and reads back (tasks, notes, events, metrics, observations).
2. **How that data should look** — typed, closed-schema widgets (kanban, checklist, timeline, table, metrics, diagram, report, form, links, references, notes, log).

The same artifact is the agent's memory *and* the human's dashboard. Both sides edit the same file. The rendering is not a view over separate storage — **the file on disk is the memory**.

---

## Why this exists

Today's AI products pick one of four shapes:

| Category | Example | What they miss |
|---|---|---|
| Agent memory infra | Letta `.af`, Mem0, Zep | No UI — memory is text/vectors the human doesn't see |
| Generative UI | A2UI, MCP Apps, Claude Artifacts | Transient per-response — not persistent memory |
| AI dashboards | Notion AI, OpenBB | Dashboard over external data, not agent-authored memory |
| Typed PKM | Tana, Capacities | Human-authored schemas, generic outline rendering |

None of them ship the combination of **(a) portable file on disk** + **(b) closed-schema widgets the agent picks per concept** + **(c) rendering that IS the storage** + **(d) agent memory that the agent reads back next session**.

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

An agent reads this JSON. It sees *"this project has a kanban of workstreams, I remember these observations about the user."* It writes back changes to the same file. A human opens the same file in any conformant renderer and sees a rendered kanban + an editable instructions panel + an observable memory list.

---

## 12 section types

Each section has a closed schema. The agent chooses which section type fits a concept.

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

See [SPEC.md](./SPEC.md) for the full field list of each.

---

## Conformance

- **A writer** (agent or human) MUST produce files that validate against [`schemas/agent.schema.json`](./schemas/agent.schema.json).
- **A reader** SHOULD render unknown section types as a fallback (e.g. raw JSON), not error.
- **Breaking changes** bump the major version. v0.x is draft; breaking changes are allowed between 0.x releases.

See [SPEC.md](./SPEC.md) § Conformance for details.

---

## Reference implementation

- **[Tsuzuri](https://github.com/knorq-ai/tsuzuri)** — desktop app (Tauri) and web, reads/writes `.agent.json` with Claude Code integration. The renderers here are the reference implementation for v0.1.

Want to add a renderer? See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Status and roadmap

- ✅ **v0.1 draft** (this repo) — 12 section types, JSON Schema, examples
- ⏳ **v0.2** — formalize extension mechanism (custom section types), stabilize ID conventions
- ⏳ **v0.3** — relations between sections (e.g. a `log` entry links to a `kanban` item)
- ⏳ **v1.0** — stable; breaking changes require major version bump

This is a draft spec from a single reference implementation. It is **not** yet widely adopted. If you're interested in a second renderer or want to propose changes, open an issue.

---

## License

Spec, schemas, and examples are licensed under [MIT](./LICENSE). You are free to build readers, writers, and derivative specs.
