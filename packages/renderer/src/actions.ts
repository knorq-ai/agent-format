// Shared action helpers usable by renderer headers and individual section types.
//
// Both `openInViewer` and `downloadPrintableHtml` route through the provided
// HostBridge when available (MCP Apps hosts), falling back to plain browser
// APIs otherwise. This is important because the MCP Apps iframe is sandboxed:
// `window.open()` and direct anchor downloads are blocked, but the host
// exposes `openLink` / `downloadFile` via the app API.

import type { AgentFile } from './types'
import { type HostBridge, fallbackOpenLink, fallbackDownload } from './host'
import { sanitizeSvgForEmbed } from './sanitize'

// Public viewer endpoint for the `.agent` format. The `#<encoded-json>` hash
// form is documented in packages/viewer/src/App.tsx and stable across
// viewer versions (renders the data client-side, no upload).
const VIEWER_URL = 'https://knorq-ai.github.io/agent-format/'

export async function openInViewer(
    data: AgentFile,
    host?: HostBridge
): Promise<boolean> {
    const json = JSON.stringify(data)
    // Hash fragment is never sent to the server, so sensitive data (legal
    // documents, audit logs) stays on the client.
    const url = `${VIEWER_URL}#${encodeURIComponent(json)}`
    if (host?.openLink) return host.openLink(url)
    return fallbackOpenLink(url)
}

// Build a self-contained HTML document that contains the SVG, wrapped in
// A3-landscape @page rules and an auto-print trigger. The user either
// downloads it (MCP Apps sandbox) or opens it directly (unsandboxed) and
// saves as PDF via their browser's print dialog.
export function buildPrintableHtml({
    svgMarkup,
    titleLabel,
    documentTitle,
    pageSize = 'A3 landscape',
    margin = '15mm',
    fontFamily = "'Yu Mincho', 'Hiragino Mincho ProN', 'MS PMincho', serif",
    autoPrint = true,
}: {
    svgMarkup: string
    titleLabel: string
    documentTitle: string
    pageSize?: string
    margin?: string
    fontFamily?: string
    autoPrint?: boolean
}): string {
    const safeTitle = escapeHtml(documentTitle)
    const safeLabel = escapeHtml(titleLabel)
    const safeSvg = sanitizeSvgForEmbed(svgMarkup)
    const autoPrintScript = autoPrint
        ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>`
        : ''
    return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: ${pageSize}; margin: ${margin}; }
  * { box-sizing: border-box; }
  body { font-family: ${fontFamily}; margin: 0; padding: 24px 40px; background: #fff; color: #000; }
  .doc-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 0.5em;
    margin: 0 0 36px;
  }
  svg { display: block; width: 100%; max-width: 1400px; margin: 0 auto; overflow: visible; }
  svg text { font-family: ${fontFamily}; }
  @media print { .toolbar { display: none !important; } }
  .toolbar { position: fixed; top: 8px; right: 12px; font-family: sans-serif; font-size: 12px; color: #666; }
</style>
</head><body>
<div class="toolbar">⌘P で印刷 / PDF 保存</div>
<h1 class="doc-title">${safeLabel}</h1>
${safeSvg}
${autoPrintScript}
</body></html>`
}

// Download a print-ready HTML for the given SVG via the host bridge if
// available, otherwise via an anchor download.
export async function downloadPrintableHtml({
    svgMarkup,
    titleLabel,
    documentTitle,
    filename,
    host,
}: {
    svgMarkup: string
    titleLabel: string
    documentTitle: string
    filename: string
    host?: HostBridge
}): Promise<boolean> {
    const html = buildPrintableHtml({
        svgMarkup,
        titleLabel,
        documentTitle,
        autoPrint: true,
    })
    if (host?.downloadFile) {
        return host.downloadFile({
            mimeType: 'text/html',
            text: html,
            filename,
        })
    }
    return fallbackDownload({
        mimeType: 'text/html',
        text: html,
        filename,
    })
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    )
}
