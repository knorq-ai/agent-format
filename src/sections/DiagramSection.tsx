import type { DiagramSection, DiagramNode } from '../types'

interface Props {
    section: DiagramSection
}

function Node({ node, depth }: { node: DiagramNode; depth: number }) {
    return (
        <li className="af-diagram-node" style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
            <div className="af-diagram-content">
                <span className="af-diagram-label">{node.label}</span>
                {node.description && (
                    <span className="af-diagram-desc"> — {node.description}</span>
                )}
            </div>
            {node.children.length > 0 && (
                <ul className="af-diagram-children">
                    {node.children.map((child) => (
                        <Node key={child.id} node={child} depth={depth + 1} />
                    ))}
                </ul>
            )}
        </li>
    )
}

export function DiagramSectionView({ section }: Props) {
    return (
        <ul className="af-diagram">
            <Node node={section.data.root} depth={0} />
        </ul>
    )
}
