import type { ReferencesSection } from '../types'

interface Props {
    section: ReferencesSection
}

export function ReferencesSectionView({ section }: Props) {
    if (section.data.items.length === 0) {
        return <p className="af-empty">No referenced files.</p>
    }
    return (
        <ul className="af-references">
            {section.data.items.map((item) => (
                <li key={item.id} className="af-reference">
                    <div className="af-reference-main">
                        <span className="af-reference-name">{item.fileName}</span>
                        <code className="af-reference-path">{item.filePath}</code>
                    </div>
                    {item.memo && <p className="af-reference-memo">{item.memo}</p>}
                </li>
            ))}
        </ul>
    )
}
