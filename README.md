# @agent-format/renderer

React renderer for the [agent file format](https://github.com/yuyamorita/agent-format) (`.agent.json`).

> Status: **Draft v0.1** — API will change until v1.0.

## Install

```bash
npm install @agent-format/renderer
```

Requires React 18+.

## Usage

```tsx
import { AgentRenderer } from '@agent-format/renderer'
import '@agent-format/renderer/styles.css'
import data from './my-project.agent.json'

export default function Page() {
    return <AgentRenderer data={data} />
}
```

## Section support (v0.1)

| Type | Status |
|---|---|
| `kanban` | ✅ Implemented |
| `notes` | ✅ Implemented |
| `log` | ✅ Implemented |
| `metrics` | ✅ Implemented |
| `checklist` | ⏳ Fallback |
| `timeline` | ⏳ Fallback |
| `table` | ⏳ Fallback |
| `diagram` | ⏳ Fallback |
| `report` | ⏳ Fallback |
| `form` | ⏳ Fallback |
| `links` | ⏳ Fallback |
| `references` | ⏳ Fallback |

Unimplemented section types render as a fallback showing the raw JSON, per the spec's conformance rule that readers MUST NOT error on unknown section types.

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
