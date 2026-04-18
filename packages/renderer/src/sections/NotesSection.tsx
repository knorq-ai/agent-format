import type { NotesSection } from '../types'

interface Props {
    section: NotesSection
}

export function NotesSectionView({ section }: Props) {
    const blocks = section.data?.blocks ?? []
    if (blocks.length === 0) {
        return <p className="af-empty">No notes.</p>
    }
    return (
        <div>
            {blocks.map((block) => (
                <div key={block.id} className="af-notes-block">
                    {block.content}
                </div>
            ))}
        </div>
    )
}
