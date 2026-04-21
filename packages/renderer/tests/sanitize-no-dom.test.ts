// @vitest-environment node
//
// Exercises the regex fallback in sanitizeSvgForEmbed that runs when no
// DOMParser is available (bare Node, serverless cold paths). The main
// renderer suite runs under happy-dom, so DOMParser is always defined and
// the fallback never fires — this file plugs that hole.
import { describe, expect, it } from 'vitest'
import { sanitizeSvgForEmbed } from '../src'

function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
        )
        .replace(/&#([0-9]+);?/g, (_m, dec: string) =>
            String.fromCharCode(parseInt(dec, 10))
        )
}

describe('sanitize.ts regex fallback (no DOMParser)', () => {
    it('has DOMParser genuinely absent in this environment', () => {
        // Sanity: if happy-dom leaked in somehow, every assertion below
        // would be testing the DOM path instead of the regex fallback.
        expect(typeof (globalThis as { DOMParser?: unknown }).DOMParser).toBe(
            'undefined'
        )
    })

    it.each([
        ['script tag', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
        ['namespaced script', '<svg xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>'],
        ['style with url(javascript:)', '<svg><style>*{background:url(javascript:alert(1))}</style></svg>'],
        ['foreignObject+iframe', '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>'],
        ['javascript: href', '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
        ['entity-encoded javascript: href', '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>'],
        ['&colon; entity scheme', '<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>'],
        ['on* handler', '<svg><circle onclick="alert(1)" cx="5" cy="5" r="1"/></svg>'],
        ['style attribute', '<svg><g style="background:url(javascript:alert(1))"/></svg>'],
        ['SMIL animate hijack', '<svg><a href="#safe"><animate attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
        ['external <use href>', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.example/x.svg#y"/></svg>'],
    ])('neutralizes: %s', (_label, dirty) => {
        const clean = sanitizeSvgForEmbed(dirty)
        const normalized = decodeEntities(clean).replace(/[\s\0]/g, '').toLowerCase()
        expect(normalized).not.toContain('javascript:')
        expect(normalized).not.toContain('vbscript:')
        expect(normalized).not.toMatch(/<script/i)
        expect(normalized).not.toMatch(/<style/i)
        expect(normalized).not.toMatch(/<foreignobject/i)
        expect(normalized).not.toMatch(/onerror|onload|onclick|onmouseover/i)
        expect(normalized).not.toMatch(/use[^>]+href="https/i)
    })

    it('is allowlist-based: strips unknown tags not explicitly listed', () => {
        // `<marquee>`, `<form>`, `<input>`, `<xyz>` are not SVG allowlist
        // entries — under a true allowlist they must be stripped, even
        // though they were never in any explicit blocklist. The DOM path
        // drops them; the fallback must do the same.
        const dirty = `<svg xmlns="http://www.w3.org/2000/svg">
          <marquee>scroll</marquee>
          <form action="https://evil.example"><input name="p"/></form>
          <xyz foo="bar">text</xyz>
          <circle cx="5" cy="5" r="1"/>
        </svg>`
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).not.toMatch(/<marquee/i)
        expect(clean).not.toMatch(/<form/i)
        expect(clean).not.toMatch(/<input/i)
        expect(clean).not.toMatch(/<xyz/i)
        // The safe geometry survives.
        expect(clean).toMatch(/cx="5"/)
    })

    it('strips SVG <image> (external image loader)', () => {
        // SVG <image href="..."/> loads cross-origin resources. It is not
        // an allowlisted element, so the fallback must remove it even
        // though it is not explicitly in destroyTags-by-name in older
        // fallback implementations.
        const dirty = '<svg><image href="https://evil.example/pixel.gif" x="0" y="0" width="1" height="1"/></svg>'
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).not.toMatch(/<image/i)
        expect(clean).not.toMatch(/evil\.example/)
    })

    it('strips HTML comments (can hide tag-smuggling payloads)', () => {
        const dirty = '<svg><!-- <script>alert(1)</script> --><circle cx="1" cy="1" r="1"/></svg>'
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).not.toContain('<!--')
        expect(clean).not.toMatch(/<script/i)
    })

    it('strips CDATA sections', () => {
        const dirty = '<svg><![CDATA[<script>alert(1)</script>]]><circle cx="1" cy="1" r="1"/></svg>'
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).not.toContain('<![CDATA[')
        expect(clean).not.toMatch(/<script/i)
    })

    it('preserves safe allowlisted geometry', () => {
        const dirty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
          <g><path d="M0 0L10 10"/><circle cx="5" cy="5" r="2"/><text x="1" y="1">hello</text></g>
        </svg>`
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).toMatch(/<svg/)
        expect(clean).toMatch(/<g/)
        expect(clean).toMatch(/<path/)
        expect(clean).toMatch(/<circle/)
        expect(clean).toMatch(/<text/)
        expect(clean).toMatch(/hello/)
    })

    it('returns empty string on empty / non-string input', () => {
        expect(sanitizeSvgForEmbed('')).toBe('')
        // @ts-expect-error — deliberate bad input
        expect(sanitizeSvgForEmbed(null)).toBe('')
        // @ts-expect-error — deliberate bad input
        expect(sanitizeSvgForEmbed(123)).toBe('')
    })
})
