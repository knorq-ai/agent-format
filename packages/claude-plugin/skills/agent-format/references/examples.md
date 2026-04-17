# Worked examples

Larger `.agent` files combining multiple section types.

---

## Project tracker

Kanban + timeline + metrics + log. Useful for cross-functional launches, product releases, or any project with milestones and risks.

```json
{
  "version": "0.1",
  "name": "Q2 launch",
  "description": "Cross-functional launch tracker.",
  "icon": "🚀",
  "createdAt": "2026-04-01T09:00:00Z",
  "updatedAt": "2026-04-17T09:00:00Z",
  "config": { "proactive": false },
  "sections": [
    {
      "id": "s_kb", "type": "kanban", "label": "Workstreams", "icon": "📋", "order": 0,
      "data": {
        "columns": [
          { "id": "c_todo", "name": "To Do", "category": "todo", "order": 0 },
          { "id": "c_doing", "name": "In Progress", "category": "doing", "order": 1, "wipLimit": 3 },
          { "id": "c_done", "name": "Done", "category": "done", "order": 2 }
        ],
        "items": [
          { "id": "i_plan", "title": "Launch plan", "type": "task", "status": "c_doing", "priority": "p1", "labelIds": [], "blockedBy": [], "createdAt": "2026-04-01T09:00:00Z", "updatedAt": "2026-04-17T09:00:00Z" }
        ],
        "labels": []
      }
    },
    {
      "id": "s_tl", "type": "timeline", "label": "Milestones", "icon": "📅", "order": 1,
      "data": {
        "items": [],
        "milestones": [
          { "id": "m_rc", "name": "Release candidate", "targetDate": "2026-05-20", "status": "open" },
          { "id": "m_launch", "name": "Public launch", "targetDate": "2026-06-03", "status": "open" }
        ]
      }
    },
    {
      "id": "s_mt", "type": "metrics", "label": "Key metrics", "icon": "📊", "order": 2,
      "data": {
        "cards": [
          { "id": "k_signups", "label": "Waitlist signups", "value": 842, "trend": "up" },
          { "id": "k_days", "label": "Days to launch", "value": 47, "unit": "d" }
        ]
      }
    },
    {
      "id": "s_lg", "type": "log", "label": "Risks & decisions", "icon": "⚠️", "order": 3,
      "data": {
        "entries": [
          { "id": "e_1", "type": "risk", "title": "Marketing sign-off slips", "severity": "high", "status": "open", "createdAt": "2026-04-05T09:00:00Z" }
        ]
      }
    }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```

---

## Research log

Notes + references + log. Useful for research sessions, literature review, or debugging journals.

```json
{
  "version": "0.1",
  "name": "Auth rewrite — research",
  "icon": "🔍",
  "createdAt": "2026-04-17T10:00:00Z",
  "updatedAt": "2026-04-17T10:00:00Z",
  "config": { "proactive": false },
  "sections": [
    {
      "id": "s_nt", "type": "notes", "label": "Findings", "icon": "📝", "order": 0,
      "data": {
        "blocks": [
          { "id": "b1", "content": "## Current state\n\nSession tokens are stored in SQLite with plaintext..." }
        ]
      }
    },
    {
      "id": "s_rf", "type": "references", "label": "Reference files", "icon": "📁", "order": 1,
      "data": {
        "items": [
          { "id": "rf1", "fileId": "f1", "fileName": "auth.ts", "filePath": "./src/auth.ts", "memo": "Current implementation." }
        ]
      }
    },
    {
      "id": "s_lg", "type": "log", "label": "Decisions", "icon": "✅", "order": 2,
      "data": { "entries": [] }
    }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```

---

## Content → mindmap

Single `diagram` section. Useful for breaking down a long document, transcript, or idea into a hierarchy.

```json
{
  "version": "0.1",
  "name": "Product principles",
  "icon": "🧭",
  "createdAt": "2026-04-17T10:00:00Z",
  "updatedAt": "2026-04-17T10:00:00Z",
  "config": { "proactive": false },
  "sections": [
    {
      "id": "s_dg", "type": "diagram", "label": "Breakdown", "order": 0,
      "data": {
        "root": {
          "id": "n0", "label": "Product principles",
          "children": [
            { "id": "n1", "label": "Speed", "description": "Every interaction under 100ms.", "children": [] },
            { "id": "n2", "label": "Trust", "description": "Never surprise the user.", "children": [
              { "id": "n3", "label": "No destructive defaults", "children": [] },
              { "id": "n4", "label": "Transparent logs", "children": [] }
            ]}
          ]
        }
      }
    }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```

---

## Meeting summary

Notes + checklist + log. Good structure for turning a meeting transcript into something actionable.

```json
{
  "version": "0.1",
  "name": "Standup — Apr 17",
  "icon": "🗓️",
  "createdAt": "2026-04-17T09:30:00Z",
  "updatedAt": "2026-04-17T09:30:00Z",
  "config": { "proactive": false },
  "sections": [
    {
      "id": "s_nt", "type": "notes", "label": "Summary", "order": 0,
      "data": { "blocks": [{ "id": "b1", "content": "Discussed Q2 roadmap. Two blockers surfaced." }] }
    },
    {
      "id": "s_cl", "type": "checklist", "label": "Action items", "order": 1,
      "data": {
        "groups": [
          {
            "id": "g1", "title": "This week",
            "items": [
              { "id": "i1", "text": "Unblock the auth migration", "checked": false },
              { "id": "i2", "text": "Draft Q2 OKRs", "checked": false }
            ]
          }
        ]
      }
    },
    {
      "id": "s_lg", "type": "log", "label": "Decisions", "order": 2,
      "data": { "entries": [] }
    }
  ],
  "memory": { "observations": [], "preferences": {} }
}
```
