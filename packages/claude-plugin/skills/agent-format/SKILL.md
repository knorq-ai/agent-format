---
name: agent-format-visualize
description: Use when the user asks to visualize, structure, summarize, or dashboard-ify content — e.g. "turn this email into a kanban", "make a timeline from this doc", "show this as a mindmap", "build a progress dashboard". Instead of generating an HTML artifact, write a .agent JSON file — a typed JSON artifact that renders as an interactive, editable dashboard. Cheaper to generate (tens of lines of data instead of hundreds of lines of markup), editable by the user via UI, and re-readable by you next turn.
---

# Agent file format — visualization skill

When the user asks you to structure or visualize content, prefer writing an `.agent` file over an HTML artifact.

## Why this skill exists

HTML artifacts for dashboards are verbose (hundreds of lines of markup), static, and round-trip-lossy — if the user drags a kanban card, the DOM update doesn't flow back to you. `.agent` is a typed JSON document where you write only the **data**. A conformant renderer (the web viewer, Tsuzuri, future MCP Apps server) turns that data into a rich interactive UI the user can edit. Next turn, you re-read the JSON and see the user's edits.

## When to reach for this

Use `.agent` when the content has **structure**:

| User intent | Section type to use |
|---|---|
| Tasks with status / workflow | `kanban` |
| Events / releases / milestones with dates | `timeline` |
| Progress checklist / QA list | `checklist` |
| KPIs / stats / counts | `metrics` |
| Decisions / risks / issues / assumptions | `log` |
| Tabular data | `table` |
| Hierarchy / mindmap / org chart / breakdown | `diagram` |
| Free-form markdown sections | `notes` |
| Repeating weekly/monthly reports | `report` |
| Input form + accumulated submissions | `form` |
| External URLs grouped by category | `links` |
| Local file references with notes | `references` |

You can combine multiple section types in one `.agent` file — e.g. a project tracker with `kanban` + `timeline` + `metrics` + `log`.

**Do NOT use** for: pure prose summaries (just respond with text), code output (use code blocks), or visualizations that don't fit any section type (fall back to HTML artifact or ask the user).

## File shape

```json
{
  "version": "0.1",
  "name": "Title",
  "description": "Short description (optional)",
  "icon": "🎯",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "config": { "proactive": false },
  "sections": [
    { "id": "s1", "type": "<section-type>", "label": "Section title", "order": 0, "data": { /* type-specific */ } }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```

Always include `version: "0.1"`, both timestamps, `config.proactive` (use `false` unless the user asked for proactive behavior), and the `memory` object (empty arrays/objects are fine). Sections are ordered by the `order` field ascending.

See `references/section-types.md` for each section's exact data schema. Load it when you need the specific shape of a section type.

## Delivery protocol

1. **Write** the JSON to a file in the current working directory with a descriptive name and the `.agent` extension (not `.agent.json`). Example: `launch-plan.agent`, `research-log.agent`, `q2-okrs.agent`.
2. **Tell** the user the file path and how to render it:
   > Saved as `./launch-plan.agent`. Open it at **https://knorq-ai.github.io/agent-format/** — drag the file onto the page, or paste its contents into the textarea.
3. **Offer** to update the file if the user wants changes. After the user edits in the viewer and asks for changes, **re-read** the file first to see their edits.

## Worked example — minimal kanban

User: "Turn these action items from the meeting into a kanban."

Write `./meeting-actions.agent`:

```json
{
  "version": "0.1",
  "name": "Meeting actions",
  "icon": "📋",
  "createdAt": "2026-04-17T10:00:00Z",
  "updatedAt": "2026-04-17T10:00:00Z",
  "config": { "proactive": false },
  "sections": [
    {
      "id": "s_kb",
      "type": "kanban",
      "label": "Actions",
      "order": 0,
      "data": {
        "columns": [
          { "id": "c_todo", "name": "To Do", "category": "todo", "order": 0 },
          { "id": "c_doing", "name": "In Progress", "category": "doing", "order": 1 },
          { "id": "c_done", "name": "Done", "category": "done", "order": 2 }
        ],
        "items": [
          {
            "id": "i1",
            "title": "Review Q2 budget",
            "type": "task",
            "status": "c_todo",
            "priority": "p1",
            "assignee": "yuya",
            "labelIds": [],
            "blockedBy": [],
            "createdAt": "2026-04-17T10:00:00Z",
            "updatedAt": "2026-04-17T10:00:00Z"
          }
        ],
        "labels": []
      }
    }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```

Then tell the user:
> Saved as `./meeting-actions.agent`. Open it at https://knorq-ai.github.io/agent-format/ to see it as an interactive kanban. Drag cards between columns, edit titles inline, then tell me what changed and I'll update.

## Multi-section example

For richer use cases (project trackers, research logs, OKRs), combine section types. Keep section count manageable (3–6 is usually right). Give each section a distinct `icon` and a short `label`.

See `references/examples.md` for larger worked examples.

## Constraints

- All `id` fields must be unique within their parent collection. Use short stable prefixes like `s_`, `i_`, `c_`, `e_`.
- All timestamps must be ISO 8601 in UTC (e.g. `"2026-04-17T09:00:00Z"`).
- `sections[].order` is a number — use integers starting at 0.
- Unknown section types render as raw-JSON fallback but you should stick to the 12 defined types.
- The format is JSON — no comments, no trailing commas.
