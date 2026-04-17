# Agent File Format — Specification v0.1 (Draft)

**Status:** Draft. Last updated 2026-04-17.
**Editors:** This is a working draft extracted from the [Tsuzuri](https://github.com/knorq-ai/tsuzuri) reference implementation.

---

## 1. Introduction

An **agent file** is a single JSON document that encodes the persistent visual memory of an AI agent. It contains typed data (in named sections, each with a closed schema), agent configuration (instructions, scheduled tasks), and a memory block (observations, preferences) that the agent reads back across sessions.

A conforming renderer MUST display each section using the section's type-specific visual affordance (a `kanban` renders as a kanban, a `timeline` renders as a timeline, and so on). A conforming writer — typically an LLM agent — MUST produce documents that validate against the JSON Schema in [`schemas/agent.schema.json`](./schemas/agent.schema.json).

### 1.1 Design goals

1. **The file is the memory.** No separate vector store, no separate database. Writers persist state by writing the JSON. Readers load state by parsing the JSON.
2. **Typed, closed schemas per widget.** Each section type has a well-defined shape. LLMs produce reliable edits because the schema is narrow.
3. **Portable.** A user can commit an `.agent` file to git, attach it to an email, or share it between apps.
4. **Human- and agent-editable.** The format is designed to be read and written by *both* a human through a UI and an LLM through direct JSON manipulation.
5. **Extensible without breaking.** Unknown fields MUST be preserved by round-trippers; unknown section types MUST NOT error the reader.

### 1.2 File metadata

| Property | Value |
|---|---|
| Extension | `.agent` |
| MIME type | `application/agent+json` |
| Encoding | UTF-8, no BOM |
| Line endings | LF (`\n`) recommended |

Files MUST use the `.agent` extension. Editors and tools that need JSON-aware behavior SHOULD register a file association for `.agent` (e.g. a VS Code language extension mapping `.agent` to `jsonc`), rather than renaming the file.

---

## 2. Conventions

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

**Timestamps.** All timestamps MUST be ISO 8601 strings in UTC (e.g. `"2026-04-17T09:00:00.000Z"`).

**IDs.** All `id` fields MUST be non-empty strings, unique within their parent collection. Implementations MAY use any format (UUID, nanoid, ULID, human-readable prefixes like `i_abc123`).

**Ordering.** Arrays that render in visual order (e.g. `sections`, `columns`) include an `order: number` field. Readers MUST sort by `order` ascending; items with equal `order` MAY appear in source order.

---

## 3. Root document

```ts
{
  version: "0.1",           // spec version (string, semver)
  name: string,             // human-readable name
  description?: string,     // short description
  icon?: string,            // single emoji (preferred) or short string
  createdAt: string,        // ISO 8601
  updatedAt: string,        // ISO 8601
  config: AgentConfig,
  sections: Section[],
  memory: AgentMemory
}
```

### 3.1 `version`

A semver string naming the spec version this document conforms to. v0.1 is the current draft. Readers MAY accept values starting with `"0."` and attempt best-effort rendering; readers MUST reject unknown major versions (e.g. `"2.0.0"`) or degrade gracefully with a warning.

### 3.2 `config` — AgentConfig

```ts
{
  proactive: boolean,              // if true, agent may act without being asked
  customInstructions?: string,     // natural-language instructions for the agent
  reviewRequired?: boolean,        // UI banner hint (renderer-dependent)
  tasks?: AgentTask[]              // scheduled prompts
}
```

`AgentTask`:

```ts
{
  id: string,
  trigger: "manual" | "daily" | "weekly",
  prompt: string,
  day?: "monday" | "tuesday" | ... | "sunday",   // required when trigger = "weekly"
  lastRun?: string,                              // ISO 8601
  label?: string                                 // UI label; defaults to prompt prefix
}
```

### 3.3 `memory` — AgentMemory

```ts
{
  observations: string[],                 // free-text agent observations
  preferences: Record<string, string>     // key-value user preferences
}
```

Memory is the primary place an agent writes what it has learned about the user or project. It is distinct from `config.customInstructions`, which is authored by the human.

### 3.4 `sections`

An array of `Section` objects. See § 4.

---

## 4. Sections

Every section conforms to `SectionBase` plus a type-specific `data` payload:

```ts
{
  id: string,
  type: SectionType,
  label: string,
  icon?: string,         // emoji
  order: number,
  data: ...              // type-specific; see subsections
}
```

`SectionType` is one of: `kanban`, `checklist`, `notes`, `timeline`, `table`, `log`, `metrics`, `diagram`, `report`, `form`, `links`, `references`.

### 4.1 `kanban`

Status-column board with items, labels, and optional team roster.

```ts
data: {
  columns: { id, name, category, wipLimit?, order, isCollapsed? }[],
  items: {
    id, title, description?, type, status,        // status = column id
    priority, assignee?, labelIds[], blockedBy[],
    estimate?, startDate?, dueDate?,
    milestoneId?, cycleId?,
    comments?: { id, author, text, createdAt }[],
    createdAt, updatedAt
  }[],
  labels: { id, name, color }[],
  team?: { id, name, role? }[]
}
```

### 4.2 `checklist`

Grouped todo items.

```ts
data: {
  groups: {
    id, title,
    items: { id, text, checked }[]
  }[]
}
```

### 4.3 `notes`

Ordered markdown blocks.

```ts
data: {
  blocks: { id, content }[]   // content is CommonMark markdown
}
```

### 4.4 `timeline`

Items with optional dates plus milestones.

```ts
data: {
  items: {
    id, title, description?,
    startDate?, endDate?,     // ISO 8601
    status, issueIds?
  }[],
  milestones: {
    id, name, description?,
    targetDate?, status
  }[]
}
```

### 4.5 `table`

Typed columns with arbitrary rows.

```ts
data: {
  columns: {
    key, label,
    type: "text" | "number" | "date" | "select" | "status",
    options?: string[]   // for select
  }[],
  rows: Record<string, unknown>[]
}
```

For `type: "status"`, the row value MUST be `{ state: "todo" | "inprogress" | "almost" | "done" | "warn", comment?: string }`.

### 4.6 `log`

Append-only log of risks, assumptions, decisions, issues.

```ts
data: {
  entries: {
    id, type,                // "risk" | "assumption" | "issue" | "dependency" | "decision" | ...
    title, description?,
    severity?,               // "high" | "medium" | "low"
    status,                  // "open" | "mitigated" | "closed" | ...
    context?, decision?,     // for type = "decision"
    alternatives?: string[],
    owner?, createdAt
  }[]
}
```

### 4.7 `metrics`

KPI cards.

```ts
data: {
  cards: {
    id, label, value,
    unit?, trend?,           // "up" | "down" | "flat"
    color?
  }[]
}
```

### 4.8 `diagram`

Nested hierarchy (mind map / org chart / breakdown).

```ts
data: {
  root: {
    id, label, description?,
    children: DiagramNode[]
  }
}
```

### 4.9 `report`

Repeating markdown reports with a shared template.

```ts
data: {
  template: string,          // markdown heading structure
  reports: {
    id, title,
    content,                 // markdown body
    createdAt, updatedAt
  }[]
}
```

### 4.10 `form`

Input fields and accumulated submissions.

```ts
data: {
  fields: {
    id, label,
    type: "text" | "textarea" | "select" | "date" | "number" | "email" | "url" | "checkbox",
    options?, required?, placeholder?
  }[],
  submissions: {
    id, values, submittedAt, submittedBy?
  }[]
}
```

### 4.11 `links`

External URLs grouped by optional category.

```ts
data: {
  items: {
    id, title, url,
    description?, category?
  }[]
}
```

### 4.12 `references`

Local file references (path + optional note).

```ts
data: {
  items: {
    id, fileId, fileName, filePath,
    memo?
  }[]
}
```

Paths are relative to the agent file's parent directory when possible. Absolute paths are permitted; renderers SHOULD handle both.

---

## 5. Versioning

The spec uses semantic versioning. v0.x is draft and MAY introduce breaking changes between minor releases. v1.0 will be stable; breaking changes after v1.0 require a major version bump.

**What counts as breaking:** removing a section type, removing a required field, changing the type of an existing field, changing enum values.

**What doesn't count as breaking:** adding new section types, adding new optional fields, adding new enum values (readers MUST tolerate unknown values).

---

## 6. Conformance

### 6.1 Writers

A conforming writer MUST:

- Produce documents that validate against [`schemas/agent.schema.json`](./schemas/agent.schema.json).
- Set `version` to a supported spec version.
- Set `createdAt` and `updatedAt`; update `updatedAt` on every write.
- Preserve unknown fields when round-tripping an existing file.

A conforming writer SHOULD:

- Emit pretty-printed JSON (2-space indent) for human-friendly diffs.
- Use stable IDs across writes (do not regenerate on edit).

### 6.2 Readers

A conforming reader MUST:

- Render sections by `type` and display them in `order` ascending.
- Not error on unknown section types; fall back to a minimal display (e.g. "Unknown section: X").
- Not error on unknown optional fields.

A conforming reader SHOULD:

- Allow the user to edit sections directly.
- Preserve unknown fields when saving.

---

## 7. Extensions

Writers MAY include top-level fields not defined in this spec, prefixed with `x-` (e.g. `x-tsuzuri-snapshot-id`). Readers MUST preserve `x-*` fields on round-trip.

Custom section types are not yet standardized. v0.2 will formalize an extension mechanism. Until then, implementations MAY add section types but SHOULD document them and accept that interop is not guaranteed.

---

## 8. Security considerations

- `.agent` files are often authored by LLMs. Renderers MUST treat all string content (including `customInstructions`, `observations`, `description`) as untrusted, and MUST escape or sandbox any HTML/markdown rendering.
- `references[].filePath` MUST NOT be followed outside of user consent; traversal (`..`) SHOULD be rejected by default.
- Renderers MUST NOT execute JavaScript from `notes` or `report` markdown content.

---

## 9. Open questions (v0.2 candidates)

- **Extension mechanism** for custom section types (namespaced `type: "x-mytype"`?).
- **Relations** between sections: e.g. a `log` entry referencing a `kanban` item by ID.
- **Binary attachments**: should the format inline images or require external refs?
- **Multi-agent files**: multiple `config` blocks in one file?
- **Schema URL in document**: `$schema` field for tooling integration.

Feedback welcome via GitHub issues.
