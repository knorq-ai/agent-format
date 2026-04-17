# Section type reference

Each section conforms to:

```ts
{ id: string, type: string, label: string, icon?: string, order: number, data: {...} }
```

Below is the `data` shape for each of the 12 v0.1 section types. All `id` fields must be unique within their parent collection.

---

## `kanban`

Status-column board with cards, labels, optional WIP limits.

```ts
data: {
  columns: { id, name, category, wipLimit?, order, isCollapsed? }[],
  items: {
    id, title, description?, type, status,    // status = column id
    priority, assignee?, labelIds[], blockedBy[],
    estimate?, startDate?, dueDate?,
    milestoneId?, cycleId?,
    comments?: { id, author, text, createdAt }[],
    createdAt, updatedAt
  }[],
  labels: { id, name, color }[],               // color = hex
  team?: { id, name, role? }[]
}
```

**Required on item**: `id`, `title`, `type`, `status` (matching a column id), `priority`, `labelIds: []`, `blockedBy: []`, `createdAt`, `updatedAt`.

---

## `checklist`

Grouped todo items with progress.

```ts
data: {
  groups: {
    id, title,
    items: { id, text, checked }[]
  }[]
}
```

---

## `notes`

Ordered markdown blocks.

```ts
data: {
  blocks: { id, content }[]    // content is CommonMark markdown
}
```

---

## `timeline`

Items (spanning) + milestones (point-in-time).

```ts
data: {
  items: {
    id, title, description?,
    startDate?, endDate?,       // ISO 8601 dates (YYYY-MM-DD or full)
    status, issueIds?
  }[],
  milestones: {
    id, name, description?,
    targetDate?, status         // status: "open" | "done" | "at-risk" | etc.
  }[]
}
```

---

## `table`

Typed columns with arbitrary rows.

```ts
data: {
  columns: {
    key, label,
    type: "text" | "number" | "date" | "select" | "status",
    options?: string[]          // for select
  }[],
  rows: Record<string, unknown>[]
}
```

For `type: "status"`, the row value MUST be `{ state: "todo" | "inprogress" | "almost" | "done" | "warn", comment?: string }`.

---

## `log`

Append-only log of decisions, risks, issues, assumptions.

```ts
data: {
  entries: {
    id, type,                   // "risk" | "decision" | "issue" | "assumption" | "dependency" | ...
    title, description?,
    severity?,                  // "high" | "medium" | "low"
    status,                     // "open" | "mitigated" | "closed" | ...
    context?, decision?,        // for type = "decision"
    alternatives?: string[],
    owner?, createdAt
  }[]
}
```

---

## `metrics`

KPI cards.

```ts
data: {
  cards: {
    id, label, value,           // value is string | number
    unit?, trend?,              // trend: "up" | "down" | "flat"
    color?
  }[]
}
```

---

## `diagram`

Nested hierarchy (mind map, org chart, work breakdown).

```ts
data: {
  root: {
    id, label, description?,
    children: DiagramNode[]     // recursive
  }
}
```

---

## `report`

Repeating markdown reports with a shared template.

```ts
data: {
  template: string,             // markdown heading structure
  reports: {
    id, title,
    content,                    // markdown body
    createdAt, updatedAt
  }[]
}
```

---

## `form`

Input fields and accumulated submissions.

```ts
data: {
  fields: {
    id, label,
    type: "text" | "textarea" | "select" | "date" | "number" | "email" | "url" | "checkbox",
    options?: string[],         // for select
    required?: boolean,
    placeholder?: string
  }[],
  submissions: {
    id, values, submittedAt, submittedBy?
  }[]
}
```

---

## `links`

External URLs, optionally grouped by category.

```ts
data: {
  items: {
    id, title, url,
    description?, category?
  }[]
}
```

---

## `references`

Local file references (path + optional note).

```ts
data: {
  items: {
    id, fileId, fileName, filePath,
    memo?
  }[]
}
```

Paths are relative to the agent file's parent directory when possible.
