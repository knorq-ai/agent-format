// Smoke + security tests for the renderer. These run against every section
// type, so regressions in defensive guards or sanitizers fail fast.
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
    AgentRenderer,
    buildPrintableHtml,
    findVariantComponent,
    sanitizeSvgForEmbed,
    SPEC_MAJOR,
    type AgentFile,
    type RendererPlugin,
    type Section,
} from '../src'

function makeAgent(sections: Section[]): AgentFile {
    return {
        version: '0.1',
        name: 'test',
        createdAt: '2026-04-18T00:00:00Z',
        updatedAt: '2026-04-18T00:00:00Z',
        config: { proactive: false },
        sections,
        memory: { observations: [], preferences: {} },
    }
}

describe('AgentRenderer — smoke', () => {
    it('renders an empty document without crashing', () => {
        const { container } = render(<AgentRenderer data={makeAgent([])} />)
        expect(container.querySelector('.af-root')).not.toBeNull()
    })

    it('respects the order field when rendering sections', () => {
        const data = makeAgent([
            {
                id: 's2',
                type: 'notes',
                label: 'Second',
                order: 1,
                data: { blocks: [{ id: 'b1', content: 'second' }] },
            },
            {
                id: 's1',
                type: 'notes',
                label: 'First',
                order: 0,
                data: { blocks: [{ id: 'b2', content: 'first' }] },
            },
        ])
        const { container } = render(<AgentRenderer data={data} />)
        const headers = container.querySelectorAll('.af-section-header')
        expect(headers[0].textContent).toContain('First')
        expect(headers[1].textContent).toContain('Second')
    })

    it('falls back on unknown section types instead of erroring (spec § 6.2)', () => {
        const data = makeAgent([
            {
                id: 's1',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: 'future-widget' as any,
                label: 'Future',
                order: 0,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: { anything: 42 } as any,
            },
        ])
        const { container } = render(<AgentRenderer data={data} />)
        expect(container.textContent).toContain('not yet implemented')
    })
})

describe('AgentRenderer — defensive guards', () => {
    // Malformed inputs we expect to survive without throwing.
    const cases: Array<{ label: string; section: Section }> = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'kanban with no columns', section: { id: 'a', type: 'kanban', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'checklist with missing groups', section: { id: 'a', type: 'checklist', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'notes with missing blocks', section: { id: 'a', type: 'notes', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'timeline with missing arrays', section: { id: 'a', type: 'timeline', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'table with no columns/rows', section: { id: 'a', type: 'table', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'log with no entries', section: { id: 'a', type: 'log', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'metrics with no cards', section: { id: 'a', type: 'metrics', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'diagram with no root', section: { id: 'a', type: 'diagram', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'report with no reports', section: { id: 'a', type: 'report', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'form with no fields', section: { id: 'a', type: 'form', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'links with no items', section: { id: 'a', type: 'links', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'references with no items', section: { id: 'a', type: 'references', label: 'x', order: 0, data: {} } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'family-graph with no persons', section: { id: 'a', type: 'family-graph', label: 'x', order: 0, data: { persons: [], relationships: [] } } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'family-graph with only 1 person and no relationships', section: { id: 'a', type: 'family-graph', label: 'x', order: 0, data: { persons: [{ id: 'p1', name: 'Alice' }], relationships: [] } } as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'family-graph with unknown variant (falls back to default)', section: { id: 'a', type: 'family-graph', label: 'x', order: 0, data: { variant: 'martian-tribunal', persons: [{ id: 'p1', name: 'x' }], relationships: [] } } as any },
        // Deprecated-alias section type still renders
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { label: 'inheritance-diagram alias still renders', section: { id: 'a', type: 'inheritance-diagram', label: 'x', order: 0, data: { persons: [{ id: 'p1', name: '山田太郎', deathDate: '令和6年1月1日' }], relationships: [] } } as any },
    ]

    for (const { label, section } of cases) {
        it(label, () => {
            expect(() => render(<AgentRenderer data={makeAgent([section])} />)).not.toThrow()
        })
    }

    it('family-graph survives a circular parent-child edge', () => {
        // Adversarial: p1 → p2 → p1 (cycle). Must not hang or stack overflow.
        const section: Section = {
            id: 's',
            type: 'family-graph',
            label: 'cycle',
            order: 0,
            data: {
                persons: [
                    { id: 'p1', name: 'A' },
                    { id: 'p2', name: 'B' },
                ],
                relationships: [
                    { type: 'parent-child', person1Id: 'p1', person2Id: 'p2' },
                    { type: 'parent-child', person1Id: 'p2', person2Id: 'p1' },
                ],
            },
        }
        expect(() => render(<AgentRenderer data={makeAgent([section])} />)).not.toThrow()
    })

    it('diagram caps recursion depth', () => {
        // Build a deeply nested tree (10_000 levels) that would overflow React's stack.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let node: any = { id: 'leaf', label: 'leaf', children: [] }
        for (let i = 0; i < 10_000; i++) {
            node = { id: `n${i}`, label: `node ${i}`, children: [node] }
        }
        const section: Section = {
            id: 's',
            type: 'diagram',
            label: 'deep',
            order: 0,
            data: { root: node },
        }
        expect(() => render(<AgentRenderer data={makeAgent([section])} />)).not.toThrow()
    })
})

describe('AgentRenderer — family-graph rendering fidelity (spec § 4)', () => {
    // Anti-regression for the bug that prompted this refactor: the old jp-court
    // renderer traversed DOWN only from the decedent, silently dropping
    // ascendants. The default family-graph renderer MUST render every person.
    it('renders every person including ascendants (父方祖父 case)', () => {
        const section: Section = {
            id: 's',
            type: 'family-graph',
            label: '拡大家系図',
            order: 0,
            data: {
                persons: [
                    { id: 'grand', name: '祖父' },
                    { id: 'father', name: '父' },
                    { id: 'mother', name: '母' },
                    { id: 'decedent', name: '被相続人', deathDate: '令和5年12月31日' },
                    { id: 'spouse', name: '配偶者' },
                    { id: 'child', name: '長男' },
                ],
                relationships: [
                    { type: 'parent-child', person1Id: 'grand', person2Id: 'father' },
                    { type: 'spouse', person1Id: 'father', person2Id: 'mother' },
                    { type: 'parent-child', person1Id: 'father', person2Id: 'decedent' },
                    { type: 'parent-child', person1Id: 'mother', person2Id: 'decedent' },
                    { type: 'spouse', person1Id: 'decedent', person2Id: 'spouse' },
                    { type: 'parent-child', person1Id: 'decedent', person2Id: 'child' },
                ],
            },
        }
        const { container } = render(<AgentRenderer data={makeAgent([section])} />)
        // Every person's name MUST appear in the rendered output.
        // (This is the exact regression the GitHub issue flagged.)
        const txt = container.textContent || ''
        expect(txt).toContain('祖父')
        expect(txt).toContain('父')
        expect(txt).toContain('母')
        expect(txt).toContain('被相続人')
        expect(txt).toContain('配偶者')
        expect(txt).toContain('長男')
    })
})

describe('AgentRenderer — plugin API', () => {
    it('uses a plugin-registered variant component when variant matches', () => {
        const PluginVariant = ({ section }: { section: Section }) => (
            <div data-testid="plugin-mark">plugin-rendered: {section.label}</div>
        )
        const plugin: RendererPlugin = {
            name: 'test-plugin',
            variants: { 'family-graph': { custom: PluginVariant } },
        }
        const section: Section = {
            id: 's',
            type: 'family-graph',
            label: 'Test',
            order: 0,
            data: {
                variant: 'custom',
                persons: [{ id: 'p1', name: 'Alice' }],
                relationships: [],
            },
        }
        const { getByTestId } = render(
            <AgentRenderer data={makeAgent([section])} plugins={[plugin]} />
        )
        expect(getByTestId('plugin-mark').textContent).toContain('plugin-rendered: Test')
    })

    it('falls back to default genealogy when no plugin claims the variant', () => {
        const section: Section = {
            id: 's',
            type: 'family-graph',
            label: 'Test',
            order: 0,
            data: {
                variant: 'unknown-variant',
                persons: [
                    { id: 'p1', name: 'Alice' },
                    { id: 'p2', name: 'Bob' },
                ],
                relationships: [{ type: 'spouse', person1Id: 'p1', person2Id: 'p2' }],
            },
        }
        const { container } = render(<AgentRenderer data={makeAgent([section])} />)
        // Default family-graph renderer outputs .af-family-graph wrapping an SVG.
        expect(container.querySelector('.af-family-graph svg')).not.toBeNull()
        expect(container.textContent).toContain('Alice')
        expect(container.textContent).toContain('Bob')
    })

    it('plugin.sections renders extension section types (x-<vendor>:<name>)', () => {
        const Ext = ({ section }: { section: Section }) => (
            <div data-testid="ext">ext:{section.label}</div>
        )
        const plugin: RendererPlugin = {
            name: 'acme',
            sections: { 'x-acme:burndown': Ext },
        }
        const data: AgentFile = {
            ...makeAgent([]),
            sections: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { id: 's1', type: 'x-acme:burndown' as any, label: 'B', order: 0, data: {} as any },
            ],
        }
        const { getByTestId } = render(<AgentRenderer data={data} plugins={[plugin]} />)
        expect(getByTestId('ext').textContent).toBe('ext:B')
    })

    it('unknown extension sections render the fallback, not a crash', () => {
        const data: AgentFile = {
            ...makeAgent([]),
            sections: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { id: 's1', type: 'x-nobody:ghost' as any, label: 'G', order: 0, data: {} as any },
            ],
        }
        const { container } = render(<AgentRenderer data={data} />)
        expect(container.textContent).toContain('not yet implemented')
    })

    it('findVariantComponent returns undefined when nothing matches', () => {
        const plugin: RendererPlugin = {
            name: 'p',
            variants: { 'family-graph': { 'jp-court': () => null } },
        }
        expect(findVariantComponent([plugin], 'family-graph', 'jp-court')).toBeDefined()
        expect(findVariantComponent([plugin], 'family-graph', 'other')).toBeUndefined()
        expect(findVariantComponent([plugin], 'kanban', 'jp-court')).toBeUndefined()
        expect(findVariantComponent([], 'family-graph', 'jp-court')).toBeUndefined()
    })
})

describe('AgentRenderer — security', () => {
    it('blocks javascript: URLs in links', () => {
        const section: Section = {
            id: 's',
            type: 'links',
            label: 'Links',
            order: 0,
            data: {
                items: [
                    { id: 'a', title: 'safe', url: 'https://example.com/' },
                    { id: 'b', title: 'danger', url: 'javascript:alert(1)' },
                    { id: 'c', title: 'also-danger', url: 'data:text/html,<script>alert(1)</script>' },
                ],
            },
        }
        const { container } = render(<AgentRenderer data={makeAgent([section])} />)
        const anchors = Array.from(container.querySelectorAll('a'))
        const hrefs = anchors.map((a) => a.getAttribute('href'))
        // Only the https:// URL should have become an actual <a href=...>.
        expect(hrefs.filter((h) => h?.startsWith('https://')).length).toBe(1)
        expect(hrefs.filter((h) => h?.startsWith('javascript:')).length).toBe(0)
        expect(hrefs.filter((h) => h?.startsWith('data:')).length).toBe(0)
    })

    it.each([
        ['entity-encoded javascript: in href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>'],
        ['hex entity javascript: in xlink:href', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="&#x6a;avascript:alert(1)"><text>x</text></a></svg>'],
        ['full hex-entity-encoded javascript: scheme', '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3a;alert(1)"><text>x</text></a></svg>'],
        ['named &colon; entity hiding the scheme colon', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript&colon;alert(1)"><text>x</text></a></svg>'],
        ['SMIL animate hijacking href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="#safe"><animate attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
        ['SMIL set hijacking href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="#safe"><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
        ['tab-split scheme', '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#9;script:alert(1)"><text>x</text></a></svg>'],
        ['newline-split scheme', '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#10;script:alert(1)"><text>x</text></a></svg>'],
        ['namespaced script', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>'],
        ['style tag with url(javascript:)', '<svg xmlns="http://www.w3.org/2000/svg"><style>*{background:url(javascript:alert(1))}</style></svg>'],
        ['style attribute', '<svg xmlns="http://www.w3.org/2000/svg"><g style="background:url(javascript:alert(1))"/></svg>'],
        ['external use href', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.example/x.svg#y"/></svg>'],
    ])('sanitizer neutralizes: %s', (_label, dirty) => {
        const clean = sanitizeSvgForEmbed(dirty)
        // Post-sanitization the string, case-folded with entities decoded,
        // must never contain an executable scheme or on* handler. Decode
        // hex and decimal entities separately so the base is unambiguous —
        // a combined `&#x?([0-9a-f]+)` regex silently parses hex as decimal
        // because the captured group has no `x` prefix to inspect.
        const decoded = clean
            .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
                String.fromCharCode(parseInt(hex, 16))
            )
            .replace(/&#([0-9]+);?/g, (_m, dec: string) =>
                String.fromCharCode(parseInt(dec, 10))
            )
        const normalized = decoded.replace(/[\s\0]/g, '').toLowerCase()
        expect(normalized).not.toContain('javascript:')
        expect(normalized).not.toContain('vbscript:')
        expect(normalized).not.toMatch(/<script/i)
        expect(normalized).not.toMatch(/<style/i)
        expect(normalized).not.toMatch(/onerror|onload|onclick|onmouseover/i)
        // External <use href> must be stripped or nullified.
        expect(normalized).not.toMatch(/use[^>]+href="https/i)
    })

    it('sanitizeSvgForEmbed strips script tags, on* handlers, javascript: URLs', () => {
        const dirty = `<svg xmlns="http://www.w3.org/2000/svg">
          <script>alert(1)</script>
          <script/>
          <a href="javascript:alert(2)" xlink:href='javascript:alert(3)'>x</a>
          <circle onclick="alert(4)" onmouseover='alert(5)' cx="5" cy="5" r="1"/>
          <foreignObject><iframe src="javascript:alert(6)"></iframe></foreignObject>
        </svg>`
        const clean = sanitizeSvgForEmbed(dirty)
        expect(clean).not.toMatch(/<script/i)
        expect(clean).not.toMatch(/javascript:/i)
        expect(clean).not.toMatch(/onclick/i)
        expect(clean).not.toMatch(/onmouseover/i)
        expect(clean).not.toMatch(/<foreignObject/i)
        // Safe geometry attributes survive.
        expect(clean).toMatch(/cx="5"/)
    })

    it('buildPrintableHtml sanitizes injected SVG', () => {
        const html = buildPrintableHtml({
            svgMarkup: '<svg><script>alert(1)</script><g onclick="x()"/></svg>',
            titleLabel: 'T',
            documentTitle: 'T',
        })
        expect(html).not.toMatch(/<script>alert/i)
        expect(html).not.toMatch(/onclick/i)
    })

    it('warns (but does not crash) on unknown major version', () => {
        const data: AgentFile = {
            ...makeAgent([]),
            version: `${SPEC_MAJOR + 5}.0`,
        }
        const { container } = render(<AgentRenderer data={data} />)
        expect(container.querySelector('.af-version-warning')).not.toBeNull()
    })

    it('rejects unsafe CSS in kanban label color', () => {
        const section: Section = {
            id: 's',
            type: 'kanban',
            label: 'Board',
            order: 0,
            data: {
                columns: [{ id: 'c1', name: 'Todo', category: 'todo', order: 0 }],
                items: [
                    {
                        id: 'i1',
                        title: 'task',
                        type: 't',
                        status: 'c1',
                        priority: 'p1',
                        labelIds: ['l1'],
                        blockedBy: [],
                        createdAt: 'x',
                        updatedAt: 'x',
                    },
                ],
                labels: [{ id: 'l1', name: 'bad', color: 'red; background-image: url(https://evil)' }],
            },
        }
        const { container } = render(<AgentRenderer data={makeAgent([section])} />)
        const labelSpan = container.querySelector('.af-label') as HTMLSpanElement | null
        expect(labelSpan).not.toBeNull()
        // The injected url() must not make it into the style.
        expect(labelSpan?.style.backgroundImage || '').not.toContain('evil')
        // Hex colors still work.
        const section2: Section = {
            ...section,
            data: {
                ...section.data,
                labels: [{ id: 'l1', name: 'ok', color: '#ff00aa' }],
            },
        }
        const { container: c2 } = render(<AgentRenderer data={makeAgent([section2])} />)
        const ok = c2.querySelector('.af-label') as HTMLSpanElement | null
        expect(ok?.style.background || ok?.style.backgroundColor).toMatch(/#ff00aa|rgb\(255,\s*0,\s*170\)/i)
    })
})
