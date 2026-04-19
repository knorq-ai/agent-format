# @agent-format/jp-court

[agent-format](https://github.com/knorq-ai/agent-format) renderer plugin that provides a Japanese court (相続関係説明図) visual template for `family-graph` sections.

> Status: **Draft v0.1**.

## Install

```bash
npm install @agent-format/jp-court
```

Peer deps: `@agent-format/renderer`, `react`, `react-dom`.

## Usage

```tsx
import { AgentRenderer } from '@agent-format/renderer'
import '@agent-format/renderer/styles.css'
import { jpCourtPlugin } from '@agent-format/jp-court'
import data from './estate.agent.json'

export default function Page() {
    return <AgentRenderer data={data} plugins={[jpCourtPlugin]} />
}
```

In your `.agent` file, set the variant on a `family-graph` section:

```json
{
  "id": "s1",
  "type": "family-graph",
  "label": "相続関係説明図",
  "order": 0,
  "data": {
    "variant": "jp-court",
    "persons": [...],
    "relationships": [...]
  }
}
```

If `jpCourtPlugin` is registered, the section renders in the jp-court visual template. If the plugin is not registered, the renderer falls back to the default genealogy layout.

## What this plugin does and does NOT do

### Does

- **Japanese-legal typography** — name labels as `（被相続人）`, `（配偶者）`, etc. via each person's `role` field
- **`出生` / `死亡` / `最後の住所`** prefixes on person blocks
- **Double horizontal line** for spouse relationships (standard Japanese court convention)
- **Dashed line** for dissolved spouse relationships
- **PDF export button** — downloads a print-ready A3 landscape HTML; open in any browser and `⌘P` to save as PDF (裁判所・法務局提出想定)

### Does NOT

- **Filter persons.** This plugin renders every person listed in `data.persons`. If a court filing should only include heirs under 民法 887 (descendants excluding ascendants), **edit the `.agent` file upstream** to include only those persons. The renderer is not a legal rules engine.
- **Compute inheritance shares.** Role labels come from the file's `role` field; this plugin doesn't calculate who's a heir or what share they get.
- **Validate 民法 conformance.** The output format matches court-accepted typography, but correctness of the data is the author's responsibility.

## License

MIT.
