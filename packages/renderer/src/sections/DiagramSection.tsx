import type { DiagramSection, DiagramNode } from '../types'

interface Props {
    section: DiagramSection
}

// Cap recursion so a pathologically deep tree (LLM hallucination, adversarial
// input) can't blow React's call stack.
const MAX_DIAGRAM_DEPTH = 50

function Node({ node, depth }: { node: DiagramNode; depth: number }) {
    if (depth > MAX_DIAGRAM_DEPTH) {
        return (
            <li className="af-diagram-node">
                <div className="af-diagram-content">
                    <span className="af-diagram-desc">
                        … (tree truncated at depth {MAX_DIAGRAM_DEPTH})
                    </span>
                </div>
            </li>
        )
    }
    const children = node.children ?? []
    return (
        <li className="af-diagram-node" style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
            <div className="af-diagram-content">
                <span className="af-diagram-label">{node.label}</span>
                {node.description && (
                    <span className="af-diagram-desc"> — {node.description}</span>
                )}
            </div>
            {children.length > 0 && (
                <ul className="af-diagram-children">
                    {children.map((child) => (
                        <Node key={child.id} node={child} depth={depth + 1} />
                    ))}
                </ul>
            )}
        </li>
    )
}

export function DiagramSectionView({ section }: Props) {
    const root = section.data?.root
    if (!root) return <p className="af-empty">No diagram.</p>
    return (
        <ul className="af-diagram">
            <Node node={root} depth={0} />
        </ul>
    )
}
