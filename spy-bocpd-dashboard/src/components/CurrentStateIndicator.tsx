import type { BOCPDData } from '../types/bocpd'
import { InfoTooltip } from './InfoTooltip'

interface Props {
  data: BOCPDData
  focusDate: string
}

export default function CurrentStateIndicator({ data, focusDate }: Props) {
  const { run_length_map, short_run_prob, changepoints, regime_segments, prices, metadata } = data

  const focusIdx = (() => {
    let idx = prices.length - 1
    for (let i = 0; i < prices.length; i++) {
      if (prices[i].date >= focusDate) { idx = i; break }
    }
    return idx
  })()

  const runLength   = run_length_map[focusIdx]?.run_length ?? 0
  const signalProb  = short_run_prob[focusIdx]?.prob ?? 0
  const signalPct   = signalProb * 100
  const signalHigh  = signalProb >= metadata.threshold

  const lastCp  = [...changepoints].reverse().find(cp => cp.date <= focusDate)
  const currSeg = [...regime_segments].reverse().find(seg => seg.start <= focusDate) ?? regime_segments[0]

  const retAnnual   = currSeg?.mean_return_annual ?? 0
  const retPositive = retAnnual >= 0

  // Semicircle gauge geometry
  const R             = 30
  const arc           = Math.PI * R
  const gaugeFill     = Math.min(signalPct / 100, 1) * arc
  const gaugeColor    = signalHigh ? '#ef4444' : signalPct > 40 ? '#f59e0b' : '#3b82f6'

  return (
    <div className="flex flex-col bg-panel border-b border-border flex-shrink-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${signalHigh ? 'bg-red animate-pulse' : 'bg-blue'}`} />
        <span className="text-[11px] font-medium uppercase tracking-widest text-t2">Regime State</span>
        <span className="ml-auto text-[9px] font-mono text-t3">Seg #{currSeg?.id ?? '—'}</span>
      </div>

      <div className="flex items-start gap-3 px-4 py-3">

        {/* Run Length */}
        <div className="flex-shrink-0 text-center min-w-[72px]">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="text-[9px] font-sans uppercase tracking-widest text-t3">Run Length</span>
            <InfoTooltip
              text="Trading days since the last detected changepoint. Resets to ~0 when a new regime begins."
              width={200}
            />
          </div>
          <div className="font-mono text-[36px] font-medium text-blue leading-none tabular-nums">{runLength}</div>
          <div className="text-[9px] font-sans text-t3 mt-0.5">days</div>
        </div>

        {/* Signal gauge + segment stats */}
        <div className="flex-1 flex flex-col gap-2">

          {/* Gauge row */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col items-center">
              <svg viewBox="0 0 80 44" width="70" height="38" className="overflow-visible">
                {/* Track */}
                <path d="M 10 40 A 30 30 0 0 1 70 40" fill="none" stroke="#1e2d45" strokeWidth={6} strokeLinecap="round" />
                {/* Fill */}
                <path d="M 10 40 A 30 30 0 0 1 70 40" fill="none" stroke={gaugeColor} strokeWidth={6}
                  strokeLinecap="round" strokeDasharray={`${gaugeFill} ${arc - gaugeFill}`} />
                {/* Threshold tick at 80% */}
                <line x1="68" y1="18" x2="72" y2="14" stroke="#ef4444" strokeWidth={1.2} opacity={0.7} />
                <text x="40" y="43" textAnchor="middle" fill={gaugeColor} fontSize={11}
                  fontFamily="'JetBrains Mono',monospace" fontWeight={500}>
                  {signalPct.toFixed(1)}%
                </text>
              </svg>
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-sans text-t3">CP Signal</span>
                <InfoTooltip
                  text="short_run_prob: P(run length < 10). The red tick marks the detection threshold. Values above it triggered the current changepoint count."
                  width={210}
                />
              </div>
              <div className={`text-[9px] font-sans mt-0.5 ${signalHigh ? 'text-red' : 'text-t3'}`}>
                {signalHigh ? '⚠ above threshold' : `thr: ${(metadata.threshold * 100).toFixed(0)}%`}
              </div>
              <div className="text-[9px] font-mono text-t3 mt-1">
                last CP:<br />{lastCp?.date ?? '—'}
              </div>
            </div>
          </div>

          {/* Segment return + vol */}
          <div className="flex gap-2">
            <div className="flex-1 bg-card border border-border rounded px-2 py-1.5">
              <div className="text-[8px] font-sans uppercase tracking-widest text-t3">Ann. Return</div>
              <div className={`font-mono text-[13px] font-medium mt-0.5 tabular-nums ${retPositive ? 'text-green' : 'text-red'}`}>
                {retPositive ? '+' : ''}{(retAnnual * 100).toFixed(1)}%
              </div>
              <div className="text-[8px] font-sans text-t3">this regime</div>
            </div>
            <div className="flex-1 bg-card border border-border rounded px-2 py-1.5">
              <div className="text-[8px] font-sans uppercase tracking-widest text-t3">Ann. Volatility</div>
              <div className="font-mono text-[13px] font-medium mt-0.5 text-t2 tabular-nums">
                {((currSeg?.std_annual ?? 0) * 100).toFixed(1)}%
              </div>
              <div className="text-[8px] font-sans text-t3">this regime</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
