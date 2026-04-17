# @agent-format/viewer

Standalone web viewer for [`.agent.json`](https://github.com/yuyamorita/agent-format) files. Drag-drop, paste, or share via URL — no install for end users.

> Status: **Draft v0.1**. Intended as a universal fallback renderer; MCP Apps integration is a separate surface.

## Load sources

| Source | How |
|---|---|
| Drag-drop | Drop a `.agent.json` file onto the page |
| File picker | Click the drop zone |
| Paste | Paste JSON into the textarea, click Render |
| URL | `/?url=https://example.com/my.agent.json` |
| Hash | `/#{encodeURIComponent(jsonString)}` |

## Development

```bash
# from this directory:
npm install          # also installs the local renderer via file: link
npm run dev          # http://localhost:5180
npm run build        # static output to dist/
```

The viewer depends on `@agent-format/renderer` via a local file link — it expects `agent-format-renderer/` to sit alongside this directory. Switch to the published package once the renderer ships to npm.

## Deploy

Static output — works on Vercel, Cloudflare Pages, GitHub Pages, Netlify, any static host. The planned public deployment is `https://agent-format.org/viewer`.

## License

MIT.
