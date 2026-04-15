import type { BOCPDData, Segment } from '../types/bocpd'
import { segColor } from './PriceChangepointTimeline'
import { InfoTooltip } from './InfoTooltip'
import { useHoverDate } from '../hooks/hoverStore'

interface Props {
  data: BOCPDData
  focusDate: string
}

export default function SegmentStatsPanel({ data, focusDate }: Props) {
  const { regime_segments, metadata } = data

  const hoverDate = useHoverDate()
  const effectiveDate = hoverDate ?? focusDate

  const activeId = (
    [...regime_segments].reverse().find(seg => seg.start <= effectiveDate) ?? regime_segments[0]
  )?.id

  function retColor(v: number) {
    if (v > 0.02) return 'text-green'
    if (v < -0.02) return 'text-red'
    return 'text-t2'
  }

  return (
    <div className="flex flex-col bg-panel h-full">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border-b border-border flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-sans font-medium uppercase tracking-widest text-t2">
            Segment Statistics
          </span>
          <p className="text-[10px] font-sans text-t3 mt-0.5">
            Ann. return &amp; volatility per regime
          </p>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-dim text-amber border border-amber/20 flex-shrink-0">
          {regime_segments.length}
        </span>
      </div>

      {/* Table — 4 columns: Seg | Days | μ | σ */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="text-left pl-4 pr-2 py-2 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium w-[40%]">
                Segment
              </th>
              <th className="text-right px-2 py-2 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">
                <span className="inline-flex items-center gap-1 justify-end">
                  Days
                  <InfoTooltip text="Number of trading days in this regime segment." width={200} />
                </span>
              </th>
              <th className="text-right px-2 py-2 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">
                <span className="inline-flex items-center gap-1 justify-end">
                  Ret Ann
                  <InfoTooltip
                    text="Annualized mean log-return = mean(daily log-ret) × 252. Excludes the triggering return on the changepoint day — that shock belongs to the regime transition, not the new regime's internal dynamics."
                    width={260}
                  />
                </span>
              </th>
              <th className="text-right pl-2 pr-4 py-2 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">
                <span className="inline-flex items-center gap-1 justify-end">
                  Vol Ann
                  <InfoTooltip
                    text="Annualized volatility = std(daily log-ret, ddof=1) × √252. Uses √252 (not ×252) because variance is additive — std scales with the square root of time."
                    width={260}
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {regime_segments.map((seg: Segment, i: number) => {
              const isActive = seg.id === activeId
              return (
                <tr
                  key={seg.id}
                  className={`border-b border-border/30 last:border-b-0 transition-colors ${
                    isActive ? 'bg-blue/5' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Seg: swatch + id + start date */}
                  <td className={`pl-3 pr-2 py-2 ${isActive ? 'border-l-2 border-blue' : 'border-l-2 border-transparent'}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-5 rounded-sm flex-shrink-0 opacity-80"
                        style={{ background: segColor(i) }}
                      />
                      <div>
                        <div className={`font-mono text-[11px] font-medium ${isActive ? 'text-blue' : 'text-t2'}`}>
                          #{seg.id}
                          {isActive && <span className="ml-1 text-blue text-[8px]">●</span>}
                        </div>
                        <div className="font-mono text-[9px] text-t3 mt-0.5">{seg.start}</div>
                      </div>
                    </div>
                  </td>

                  <td className={`px-2 py-2 font-mono text-right text-[11px] tabular-nums ${isActive ? 'text-amber font-medium' : 'text-t2'}`}>
                    {seg.n_days}
                  </td>
                  <td className={`px-2 py-2 font-mono text-right text-[11px] font-medium tabular-nums ${retColor(seg.mean_return_annual)}`}>
                    {seg.mean_return_annual >= 0 ? '+' : ''}{(seg.mean_return_annual * 100).toFixed(1)}%
                  </td>
                  <td className="pl-2 pr-4 py-2 font-mono text-right text-[11px] tabular-nums text-t2">
                    {(seg.std_annual * 100).toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* BOCPD model info */}
      <div className="px-4 py-3 border-t border-border bg-card flex-shrink-0">
        <div className="text-[9px] font-sans font-semibold uppercase tracking-widest text-t3 mb-1.5">
          About this model
        </div>
        <p className="text-[10px] font-sans text-t3 leading-relaxed">
          <span className="text-t2 font-medium">BOCPD</span> (Adams &amp; MacKay, 2007).
          Hazard rate <span className="font-mono text-blue">1/λ = {(1 / metadata.lambda).toFixed(4)}</span>.
          Student-T likelihood with Normal-Gamma conjugate prior on log-returns.
        </p>
      </div>
    </div>
  )
}
