// Smoke + security tests for the renderer. These run against every section
// type, so regressions in defensive guards or sanitizers fail fast.
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { AgentRenderer, type AgentFile, type Section } from '../src'

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
    // Spec § 6.2: "A conforming reader MUST not error on unknown optional fields."
    // Our interpretation: also don't crash on missing required arrays from LLM slop.
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
    ]

    for (const { label, section } of cases) {
        it(label, () => {
            expect(() => render(<AgentRenderer data={makeAgent([section])} />)).not.toThrow()
        })
    }

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
