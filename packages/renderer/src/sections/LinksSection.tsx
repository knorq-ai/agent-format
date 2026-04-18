import type { LinksSection, LinkItem } from '../types'

interface Props {
    section: LinksSection
}

// Block javascript:, data:, vbscript:, file:, etc. Only allow the URL schemes
// we actively want to render as clickable links. Untrusted .agent input can
// otherwise smuggle XSS payloads through <a href={javascript:...}>.
//
// We parse WITHOUT a base URL so that relative (`./foo`) and scheme-relative
// (`//evil.com/phish`) inputs throw instead of being silently promoted to an
// off-origin `https://evil.com/` href.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function safeHref(url: string): string | undefined {
    if (typeof url !== 'string') return undefined
    try {
        const parsed = new URL(url)
        if (SAFE_PROTOCOLS.has(parsed.protocol)) return parsed.href
    } catch {
        /* malformed or non-absolute URL → no link */
    }
    return undefined
}

function groupByCategory(items: LinkItem[]): Array<[string, LinkItem[]]> {
    const groups = new Map<string, LinkItem[]>()
    for (const item of items) {
        const key = item.category ?? ''
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
    }
    return Array.from(groups.entries())
}

export function LinksSectionView({ section }: Props) {
    const items = section.data?.items ?? []
    if (items.length === 0) return <p className="af-empty">No links.</p>
    const groups = groupByCategory(items)
    return (
        <div className="af-links">
            {groups.map(([category, items]) => (
                <div key={category || '_'} className="af-links-group">
                    {category && <div className="af-links-category">{category}</div>}
                    <ul className="af-links-list">
                        {items.map((item) => {
                            const href = safeHref(item.url)
                            return (
                                <li key={item.id} className="af-link">
                                    {href ? (
                                        <a href={href} target="_blank" rel="noreferrer noopener">
                                            {item.title}
                                        </a>
                                    ) : (
                                        <span className="af-link-unsafe" title={`Blocked URL: ${item.url}`}>
                                            {item.title}
                                        </span>
                                    )}
                                    {item.description && (
                                        <p className="af-link-desc">{item.description}</p>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </div>
            ))}
        </div>
    )
}
