import type { ChecklistSection } from '../types'

interface Props {
    section: ChecklistSection
}

export function ChecklistSectionView({ section }: Props) {
    return (
        <div className="af-checklist">
            {section.data.groups.map((group) => {
                const checkedCount = group.items.filter((i) => i.checked).length
                return (
                    <div key={group.id} className="af-checklist-group">
                        <div className="af-checklist-group-title">
                            <span>{group.title}</span>
                            <span className="af-checklist-count">
                                {checkedCount} / {group.items.length}
                            </span>
                        </div>
                        <ul className="af-checklist-items">
                            {group.items.map((item) => (
                                <li key={item.id} className="af-checklist-item">
                                    <input
                                        type="checkbox"
                                        checked={item.checked}
                                        readOnly
                                    />
                                    <span className={item.checked ? 'af-checklist-text af-checklist-text--done' : 'af-checklist-text'}>
                                        {item.text}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            })}
        </div>
    )
}
