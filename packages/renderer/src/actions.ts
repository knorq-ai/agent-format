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
import { buildViewerUrl } from './share'

const VALID_PAGE_SIZES = new Map<string, string>([
    ['a5', 'A5'],
    ['a5 landscape', 'A5 landscape'],
    ['a4', 'A4'],
    ['a4 landscape', 'A4 landscape'],
    ['a3', 'A3'],
    ['a3 landscape', 'A3 landscape'],
    ['b5', 'B5'],
    ['b5 landscape', 'B5 landscape'],
    ['b4', 'B4'],
    ['b4 landscape', 'B4 landscape'],
    ['letter', 'Letter'],
    ['letter landscape', 'Letter landscape'],
    ['legal', 'Legal'],
    ['legal landscape', 'Legal landscape'],
    ['ledger', 'Ledger'],
    ['ledger landscape', 'Ledger landscape'],
    ['tabloid', 'Tabloid'],
    ['tabloid landscape', 'Tabloid landscape'],
])

const CUSTOM_PAGE_SIZE_RE = /^[\d.]+(mm|cm|in|pt|px)\s+[\d.]+(mm|cm|in|pt|px)$/i
const PAGE_MARGIN_RE = /^(\d+(\.\d+)?(mm|cm|in|pt|px)\s*){1,4}$/i
const INVALID_FONT_FAMILY_RE = /[^A-Za-z0-9 ,'"-]/
const BLOCKED_FONT_FAMILY_RE = /{|}|<|>|;|\/\*|\*\/|@/

export async function openInViewer(
    data: AgentFile,
    host?: HostBridge
): Promise<boolean> {
    // Hash fragment is never sent to the server, so sensitive data (legal
    // documents, audit logs) stays on the client.
    const url = buildViewerUrl(data)
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
    const safePageSize = sanitizePageSize(pageSize)
    const safeMargin = sanitizeMargin(margin)
    const safeFontFamily = sanitizeFontFamily(fontFamily)
    const autoPrintScript = autoPrint
        ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>`
        : ''
    return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: ${safePageSize}; margin: ${safeMargin}; }
  * { box-sizing: border-box; }
  body { font-family: ${safeFontFamily}; margin: 0; padding: 24px 40px; background: #fff; color: #000; }
  .doc-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 0.5em;
    margin: 0 0 36px;
  }
  svg { display: block; width: 100%; max-width: 1400px; margin: 0 auto; overflow: visible; }
  svg text { font-family: ${safeFontFamily}; }
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

function sanitizePageSize(pageSize: string): string {
    const normalized = pageSize.trim().toLowerCase().replace(/\s+/g, ' ')
    if (VALID_PAGE_SIZES.has(normalized)) return VALID_PAGE_SIZES.get(normalized) as string
    if (CUSTOM_PAGE_SIZE_RE.test(pageSize.trim())) return pageSize.trim()
    return 'A4'
}

function sanitizeMargin(margin: string): string {
    const normalized = margin.trim()
    return PAGE_MARGIN_RE.test(normalized) ? normalized : '20mm'
}

function sanitizeFontFamily(fontFamily: string): string {
    const normalized = fontFamily.trim()
    if (
        !normalized ||
        BLOCKED_FONT_FAMILY_RE.test(normalized) ||
        INVALID_FONT_FAMILY_RE.test(normalized)
    ) {
        return 'sans-serif'
    }
    return normalized
}
