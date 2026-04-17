import type { NotesSection } from '../types'

interface Props {
    section: NotesSection
}

export function NotesSectionView({ section }: Props) {
    return (
        <div>
            {section.data.blocks.map((block) => (
                <div key={block.id} className="af-notes-block">
                    {block.content}
                </div>
            ))}
        </div>
    )
}
