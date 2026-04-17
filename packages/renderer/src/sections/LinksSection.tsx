import type { LinksSection, LinkItem } from '../types'

interface Props {
    section: LinksSection
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
    const groups = groupByCategory(section.data.items)
    if (section.data.items.length === 0) return <p className="af-empty">No links.</p>
    return (
        <div className="af-links">
            {groups.map(([category, items]) => (
                <div key={category || '_'} className="af-links-group">
                    {category && <div className="af-links-category">{category}</div>}
                    <ul className="af-links-list">
                        {items.map((item) => (
                            <li key={item.id} className="af-link">
                                <a href={item.url} target="_blank" rel="noreferrer noopener">
                                    {item.title}
                                </a>
                                {item.description && (
                                    <p className="af-link-desc">{item.description}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}
