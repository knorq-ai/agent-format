import type { ChecklistSection } from '../types'

interface Props {
    section: ChecklistSection
}

export function ChecklistSectionView({ section }: Props) {
    const groups = section.data?.groups ?? []
    if (groups.length === 0) {
        return <p className="af-empty">No checklist groups.</p>
    }
    return (
        <div className="af-checklist">
            {groups.map((group) => {
                const items = group.items ?? []
                const checkedCount = items.filter((i) => i.checked).length
                return (
                    <div key={group.id} className="af-checklist-group">
                        <div className="af-checklist-group-title">
                            <span>{group.title}</span>
                            <span className="af-checklist-count">
                                {checkedCount} / {items.length}
                            </span>
                        </div>
                        <ul className="af-checklist-items">
                            {items.map((item) => (
                                <li key={item.id} className="af-checklist-item">
                                    {/* v0.1 viewer is read-only; disabled is the correct HTML
                                        attribute for a non-interactive checkbox (readOnly is
                                        text-input-only per HTML spec and React warns). */}
                                    <input
                                        type="checkbox"
                                        checked={item.checked}
                                        disabled
                                        aria-readonly="true"
                                        onChange={() => {}}
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
