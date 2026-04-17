import type { Section } from '../types'

interface Props {
    section: Section
}

export function FallbackSectionView({ section }: Props) {
    return (
        <div className="af-fallback">
            <div>
                Renderer for section type <strong>{section.type}</strong> is not yet implemented in this viewer.
            </div>
            <pre>{JSON.stringify(section.data, null, 2)}</pre>
        </div>
    )
}
