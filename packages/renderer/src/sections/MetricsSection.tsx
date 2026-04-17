import type { MetricsSection } from '../types'

interface Props {
    section: MetricsSection
}

export function MetricsSectionView({ section }: Props) {
    return (
        <div className="af-metrics">
            {section.data.cards.map((card) => {
                const trendChar = card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : card.trend === 'flat' ? '→' : ''
                const trendClass = card.trend ? `af-metric-trend af-metric-trend--${card.trend}` : 'af-metric-trend'
                return (
                    <div key={card.id} className="af-metric">
                        <p className="af-metric-label">{card.label}</p>
                        <div className="af-metric-value">
                            <span>{card.value}</span>
                            {card.unit && <span className="af-metric-unit">{card.unit}</span>}
                            {trendChar && <span className={trendClass}>{trendChar}</span>}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
