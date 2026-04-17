import type { ReactNode } from 'react'
import type { TableSection, TableColumn } from '../types'

interface Props {
    section: TableSection
}

interface StatusValue {
    state: string
    comment?: string
}

function isStatusValue(v: unknown): v is StatusValue {
    return typeof v === 'object' && v !== null && 'state' in v
}

function renderCell(value: unknown, col: TableColumn): ReactNode {
    if (value == null || value === '') return <span className="af-table-empty">—</span>
    if (col.type === 'status' && isStatusValue(value)) {
        const cls = `af-status af-status--${value.state}`
        return (
            <span className={cls}>
                {value.state}
                {value.comment && <span className="af-status-comment"> · {value.comment}</span>}
            </span>
        )
    }
    if (col.type === 'date' && typeof value === 'string') return value
    if (col.type === 'number') return String(value)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    return <code className="af-table-raw">{JSON.stringify(value)}</code>
}

export function TableSectionView({ section }: Props) {
    const { columns, rows } = section.data
    if (rows.length === 0) return <p className="af-empty">No rows.</p>
    return (
        <div className="af-table-wrap">
            <table className="af-table">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key}>{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            {columns.map((col) => (
                                <td key={col.key}>{renderCell(row[col.key], col)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
