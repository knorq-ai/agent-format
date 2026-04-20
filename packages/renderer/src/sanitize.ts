// Defensive sanitizer for SVG strings before they get inlined into HTML we
// ship to the browser (print/PDF flow) or hand to a third party.
//
// Callers include `buildPrintableHtml`, which embeds `svgMarkup` raw into a
// standalone HTML document. Even though the renderer's own SVG output is
// trusted today, `svgMarkup` is a public API parameter so any external caller
// could pass arbitrary untrusted SVG. SVG is an XSS vector: `<script>`,
// `on*` event handlers, `<style>` with `url(javascript:...)` or `expression()`,
// `href`/`xlink:href` with `javascript:` (including entity-encoded and
// whitespace-obfuscated variants), external `<use href>`, and more.
//
// Strategy:
//   1. When a DOMParser is available (browser, happy-dom in tests, jsdom),
//      parse the SVG and walk the tree with an element/attribute allowlist.
//      Parsing-based sanitization defeats regex bypasses by construction.
//   2. If DOMParser is unavailable (bare Node without a DOM polyfill),
//      fall back to a hardened regex pass. The regex path is intentionally
//      destructive — prefer false positives over false negatives.
//
// This sanitizer is intended as defense in depth. Callers SHOULD still
// treat SVG input as potentially untrusted and avoid rendering it in
// security-sensitive contexts without a Content-Security-Policy.

const SVG_NS = 'http://www.w3.org/2000/svg'

// Conservative allowlist. Drop anything we don't positively know to be safe.
const ALLOWED_TAGS = new Set([
    'svg', 'g', 'defs', 'title', 'desc',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textPath',
    'marker', 'symbol', 'clipPath', 'mask', 'pattern',
    'linearGradient', 'radialGradient', 'stop',
    'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
    'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
    'feDisplacementMap', 'feFlood', 'feGaussianBlur', 'feMerge',
    'feMergeNode', 'feMorphology', 'feOffset', 'feSpecularLighting',
    'feTile', 'feTurbulence', 'feFuncA', 'feFuncR', 'feFuncG', 'feFuncB',
    'a', 'use',
])

// Denied outright — even if they happen to slip past tag lowercasing.
// SMIL animation elements are denied because `<animate to="javascript:...">`
// can hijack a permitted `href` attribute at runtime on real browsers.
const DENIED_TAGS = new Set([
    'script', 'style', 'foreignobject', 'foreignObject',
    'iframe', 'object', 'embed', 'image', 'animation',
    'animate', 'animateTransform', 'animateMotion', 'set',
    'mpath', 'discard', 'audio', 'video', 'canvas',
])

// `href` / `xlink:href` / `src` / `action` are scrubbed via url policy.
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction'])

function isSafeUrl(raw: string): boolean {
    if (typeof raw !== 'string') return false
    // Decode numeric HTML entities so `&#106;avascript:` and
    // `&#x6a;avascript:` both resolve before we match, defeating the most
    // common entity-based bypasses. Use separate decimal and hex passes so
    // the base is never ambiguous (a prior implementation tried to detect
    // hex via `.match(/^x/i)` on the captured digits-only group and silently
    // fell through to decimal parsing, leaking `javascript:`).
    const decoded = raw
        .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => {
            const n = parseInt(hex, 16)
            return Number.isFinite(n) ? String.fromCharCode(n) : ''
        })
        .replace(/&#([0-9]+);?/g, (_m, dec: string) => {
            const n = parseInt(dec, 10)
            return Number.isFinite(n) ? String.fromCharCode(n) : ''
        })
        // Also decode the named entities a browser would resolve inside an
        // href attribute, because `&colon;` → `:` (etc.) lets an attacker
        // hide the scheme's colon.
        .replace(/&colon;/gi, ':')
        .replace(/&tab;/gi, '\t')
        .replace(/&newline;/gi, '\n')
    // Strip control chars (incl. \t, \n, \r, NUL, BOM) before scheme check.
    // Browsers will canonicalize away these characters in URL schemes, so
    // `java\tscript:` must be treated the same as `javascript:`.
    const normalized = decoded.replace(/[\x00-\x1f\x7f\u200b-\u200f\ufeff]/g, '').trimStart()
    const lower = normalized.toLowerCase()
    if (/^(?:javascript|vbscript|data|blob|filesystem):/i.test(lower)) return false
    // Same-document fragments are fine (`#id`). Relative / absolute http(s) fine.
    if (lower.startsWith('#')) return true
    if (lower.startsWith('/')) return true
    if (/^https?:\/\//.test(lower)) return true
    if (/^mailto:/.test(lower)) return true
    if (/^tel:/.test(lower)) return true
    // Schemeless relative (no `:` before first `/` or `?` or `#`) is fine.
    const firstColon = lower.indexOf(':')
    const firstSlash = lower.indexOf('/')
    if (firstColon === -1) return true
    if (firstSlash !== -1 && firstSlash < firstColon) return true
    return false
}

function sanitizeDom(root: Element): void {
    const walker = root.ownerDocument!.createTreeWalker(root, 0x1 /* NodeFilter.SHOW_ELEMENT */)
    const toRemove: Element[] = []
    let node: Node | null = walker.currentNode
    while (node) {
        if (node.nodeType === 1) {
            const el = node as Element
            const tag = el.localName
            if (DENIED_TAGS.has(tag.toLowerCase()) || !ALLOWED_TAGS.has(tag)) {
                toRemove.push(el)
            } else {
                for (const attr of Array.from(el.attributes)) {
                    const name = attr.name.toLowerCase()
                    // Drop any on* handlers.
                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name)
                        continue
                    }
                    // Drop inline style entirely — it can hide url(javascript:)
                    // and expression() payloads.
                    if (name === 'style') {
                        el.removeAttribute(attr.name)
                        continue
                    }
                    if (URL_ATTRS.has(name)) {
                        if (!isSafeUrl(attr.value)) {
                            el.removeAttribute(attr.name)
                        }
                    }
                }
                // For <use>, only allow same-document fragment references.
                // SVG parsers vary on whether `xlink:href` ends up under the
                // XLink namespace or as a qualified-name attribute, so iterate
                // all attributes and strip any href-ish one whose value isn't
                // a local fragment.
                if (tag === 'use') {
                    for (const a of Array.from(el.attributes)) {
                        const n = a.name.toLowerCase()
                        if ((n === 'href' || n.endsWith(':href')) && !a.value.startsWith('#')) {
                            el.removeAttributeNode(a)
                        }
                    }
                }
            }
        }
        node = walker.nextNode()
    }
    for (const el of toRemove) el.parentNode?.removeChild(el)
}

// Hardened regex fallback for environments without DOMParser. Intentionally
// aggressive: we'd rather destroy valid SVG than miss a payload.
function sanitizeRegex(svg: string): string {
    let out = svg
    // Strip anything that looks like a script / style / foreign-object block,
    // with or without namespace prefixes (handles `<svg:script>`).
    const blockTags = [
        'script', 'style', 'foreignObject', 'iframe', 'object', 'embed',
        // SMIL animation elements can hijack permitted href/src attributes
        // via `to=`/`values=`/`from=` even if their own attributes look clean.
        'animate', 'animateTransform', 'animateMotion', 'set', 'mpath', 'discard',
        'audio', 'video', 'canvas',
    ]
    for (const t of blockTags) {
        const open = new RegExp(`<(?:[\\w-]+:)?${t}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w-]+:)?${t}\\s*[^>]*>`, 'gi')
        const selfClose = new RegExp(`<(?:[\\w-]+:)?${t}\\b[^>]*\\/>`, 'gi')
        // Also strip malformed / unterminated openings up to the next `>`
        // as a conservative backstop (prevents `<script x="</script"...` tricks).
        const orphan = new RegExp(`<(?:[\\w-]+:)?${t}\\b[^>]*>`, 'gi')
        out = out.replace(open, '').replace(selfClose, '').replace(orphan, '')
    }
    // Drop all on* attributes.
    out = out.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Drop all style="" attributes.
    out = out.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Backstop scrub: even if a block-tag regex missed an animation element
    // (e.g. attribute interleaving like `<animate x="1"`), strip the animation
    // value attributes wholesale. These are useless on non-animation tags and
    // the only way they're dangerous is on animation tags.
    out = out.replace(
        /\s+(to|from|values|by|attributeName)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        ''
    )
    // On `<use>` elements, only allow href/xlink:href values that are local
    // fragment refs (`#id`). External refs (http(s)://, data:, file://, etc.)
    // are stripped.
    out = out.replace(
        /<(use)\b([^>]*)>/gi,
        (_m, tag: string, attrs: string) => {
            const cleaned = attrs.replace(
                /\s((?:[\w-]+:)?href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
                (_f, name: string, _full: string, dq?: string, sq?: string, bare?: string) => {
                    const v = dq ?? sq ?? bare ?? ''
                    return v.startsWith('#') ? ` ${name}="${v.replace(/"/g, '&quot;')}"` : ''
                }
            )
            return `<${tag}${cleaned}>`
        }
    )
    // Strip `href`/`xlink:href`/`src`/`action` whose (entity-decoded,
    // whitespace-collapsed, lowercased) value starts with a dangerous scheme.
    out = out.replace(
        /\s(href|xlink:href|src|action|formaction)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (_m, name: string, _full: string, dq?: string, sq?: string, bare?: string) => {
            const raw = dq ?? sq ?? bare ?? ''
            return isSafeUrl(raw) ? ` ${name}="${raw.replace(/"/g, '&quot;')}"` : ''
        }
    )
    return out
}

export function sanitizeSvgForEmbed(svg: string): string {
    if (typeof svg !== 'string' || svg.length === 0) return ''
    const hasDOM =
        typeof DOMParser !== 'undefined' &&
        typeof XMLSerializer !== 'undefined'
    if (!hasDOM) return sanitizeRegex(svg)
    try {
        // Parse as XML so that malformed tags don't silently get autofixed.
        // SVG is XML; any payload that isn't well-formed XML is suspicious
        // and falls through to the regex path.
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        const err = doc.getElementsByTagName('parsererror')[0]
        const root = doc.documentElement
        if (err || !root || root.namespaceURI !== SVG_NS) {
            return sanitizeRegex(svg)
        }
        sanitizeDom(root)
        return new XMLSerializer().serializeToString(root)
    } catch {
        return sanitizeRegex(svg)
    }
}
