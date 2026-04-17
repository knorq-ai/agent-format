# @agent-format/renderer

React renderer for the [agent file format](https://github.com/knorq-ai/agent-format) (`.agent`).

> Status: **Draft v0.1** — API will change until v1.0.

## Install

```bash
npm install @agent-format/renderer
```

Requires React 18+.

## Usage

```tsx
import { AgentRenderer, type AgentFile } from '@agent-format/renderer'
import '@agent-format/renderer/styles.css'

export default function Page({ data }: { data: AgentFile }) {
    return <AgentRenderer data={data} />
}

// Loading the file (browser):
// const res = await fetch('/my-project.agent')
// const data = await res.json() as AgentFile
```

## Section support (v0.1)

All 12 v0.1 section types are implemented:

| Type | Use for |
|---|---|
| `kanban` | Status-column board with cards, labels, WIP limits |
| `checklist` | Grouped todo items with progress counts |
| `notes` | Ordered markdown blocks |
| `timeline` | Items + milestones with dates |
| `table` | Rows with typed columns (text / number / date / select / status) |
| `log` | Risks, decisions, issues with badges |
| `metrics` | KPI cards with value / unit / trend |
| `diagram` | Nested tree (mind map / hierarchy) |
| `report` | Repeating markdown reports |
| `form` | Input fields + submission count |
| `links` | URL list grouped by category |
| `references` | File references with memos |

Unknown section types render as a fallback showing the raw JSON, per the spec's conformance rule that readers MUST NOT error on unknown section types.

## Styling

Import `@agent-format/renderer/styles.css`. CSS variables (prefixed `--af-*`) can be overridden at the root level for theming. Dark mode is handled via `prefers-color-scheme`.

## Development

```bash
npm install
npm run build      # produces dist/
npm run dev        # watch mode
```

## License

MIT.
