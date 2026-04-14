import type { BOCPDData } from '../types/bocpd'
import { InfoTooltip } from './InfoTooltip'

interface Props {
  data: BOCPDData
  focusDate: string
  isHovering: boolean
}

interface KPIRowProps {
  label: string
  value: string
  desc: string
  tooltip: string
  valueClass?: string
  up?: boolean | null   // null = neutral
}

function KPIRow({ label, value, desc, tooltip, valueClass = 'text-t1', up = null }: KPIRowProps) {
  const descColor = up === true ? 'text-green/70' : up === false ? 'text-red/70' : 'text-t3'
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 px-4 py-2.5 border-b border-border">
      {/* Left: label + desc */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-sans font-medium tracking-wide text-t2">{label}</span>
          <InfoTooltip text={tooltip} width={220} />
        </div>
        <div className={`text-[10px] font-sans mt-0.5 leading-snug truncate ${descColor}`}>{desc}</div>
      </div>
      {/* Right: value — fixed right-aligned */}
      <div className={`font-mono text-[18px] font-semibold leading-none tabular-nums text-right pt-0.5 ${valueClass}`}>
        {value}
      </div>
    </div>
  )
}

export default function KPIBar({ data, focusDate, isHovering }: Props) {
  const { prices, short_run_prob, run_length_map, changepoints, regime_segments, metadata } = data

  const focusIdx = (() => {
    let idx = prices.length - 1
    for (let i = 0; i < prices.length; i++) {
      if (prices[i].date >= focusDate) { idx = i; break }
    }
    return idx
  })()

  const focusClose = prices[focusIdx]?.close ?? 0
  const prevClose  = prices[focusIdx - 1]?.close ?? focusClose
  const dayChange  = focusClose - prevClose
  const dayPct     = prevClose ? dayChange / prevClose : 0
  const priceUp    = dayChange >= 0

  const signalProb = short_run_prob[focusIdx]?.prob ?? 0
  const signalPct  = signalProb * 100
  const signalHigh = signalProb >= metadata.threshold

  const runLength  = run_length_map[focusIdx]?.run_length ?? 0

  const lastCp     = [...changepoints].reverse().find(cp => cp.date <= focusDate)
  const currentSeg = [...regime_segments].reverse().find(seg => seg.start <= focusDate) ?? regime_segments[0]

  const isAtEnd    = focusDate === prices[prices.length - 1]?.date

  return (
    <div className="flex flex-col bg-panel border-b border-border flex-shrink-0">

      {/* ── Date strip ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-150 ${
            isHovering ? 'bg-blue animate-pulse' : 'bg-t3'
          }`}
        />
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-sans uppercase tracking-widest text-t3 flex-shrink-0">
            {isHovering ? 'Cursor' : isAtEnd ? 'Latest' : 'Brush end'}
          </span>
          <span className="font-mono text-[13px] font-medium text-t1 tabular-nums">{focusDate}</span>
        </div>
      </div>

      {/* ── KPI rows ── */}
      <KPIRow
        label={metadata.ticker ?? 'Price'}
        value={`$${focusClose.toFixed(2)}`}
        desc={`${priceUp ? '▲' : '▼'} ${Math.abs(dayChange).toFixed(2)}  (${priceUp ? '+' : ''}${(dayPct * 100).toFixed(2)}%)`}
        tooltip="Closing price on the viewed date and its change from the prior trading day."
        valueClass={priceUp ? 'text-green' : 'text-red'}
        up={priceUp}
      />
      <KPIRow
        label="CP Signal"
        value={`${signalPct.toFixed(1)}%`}
        desc={`short_run_prob  ·  ${signalHigh ? 'HIGH — regime change likely' : 'below threshold'}`}
        tooltip="P(run length < 10): posterior probability that a changepoint occurred within the last 10 trading days. Values above the threshold trigger a detected changepoint."
        valueClass={signalHigh ? 'text-red' : 'text-amber'}
      />
      <KPIRow
        label="Last Changepoint"
        value={lastCp?.date ?? '—'}
        desc={`${metadata.n_changepoints} total  ·  currently Seg #${currentSeg?.id ?? '—'}`}
        tooltip="Most recent BOCPD changepoint at or before the viewed date — the start of the current market regime."
        valueClass="text-t1 !text-[13px]"
      />
      <KPIRow
        label="Run Length"
        value={`${runLength}`}
        desc={`days in current regime  ·  Seg #${currentSeg?.id ?? '—'}`}
        tooltip="argmax_r P(r_t = r | data): most probable number of trading days elapsed since the last changepoint. Drops to ~0 after each detected changepoint."
        valueClass="text-blue"
      />
    </div>
  )
}
