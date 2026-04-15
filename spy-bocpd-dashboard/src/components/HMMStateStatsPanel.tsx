import { useMemo, memo } from 'react'
import type { HMMData, StateParam } from '../types/hmm'
import { useHoverDate } from '../hooks/hoverStore'

const HMM_COLORS = {
  bull:    '#22c55e',
  neutral: '#f59e0b',
  bear:    '#ef4444',
} as const
type RegimeLabel = 'bull' | 'neutral' | 'bear'

const LABEL_ORDER: RegimeLabel[] = ['bull', 'neutral', 'bear']

interface Props {
  data: HMMData
  focusDate: string
}

function StateBadge({ label }: { label: RegimeLabel }) {
  const bg: Record<RegimeLabel, string> = {
    bull:    'bg-green-500/10 border-green-500/30 text-green-400',
    neutral: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    bear:    'bg-red-500/10   border-red-500/30   text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-semibold uppercase tracking-wide ${bg[label]}`}>
      {label}
    </span>
  )
}

function pct(v: number, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`
}

function HMMStateStatsPanel({ data, focusDate }: Props) {
  const { state_sequence, state_params, transition_matrix, metadata } = data

  const hoverDate = useHoverDate()
  const effectiveDate = hoverDate ?? focusDate

  // --- Derive current state (binary search, O(log n)) ---
  const currentState = useMemo(() => {
    if (!state_sequence.length) return undefined
    if (!effectiveDate) return state_sequence[state_sequence.length - 1]
    let lo = 0, hi = state_sequence.length - 1
    let result = state_sequence[0]
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (state_sequence[mid].date <= effectiveDate) { result = state_sequence[mid]; lo = mid + 1 }
      else hi = mid - 1
    }
    return result
  }, [state_sequence, effectiveDate])
  const currentLabel = currentState?.label as RegimeLabel | undefined

  // --- Days fraction per state (only recomputes when data changes) ---
  const { totalDays, daysByLabel } = useMemo(() => {
    const counts: Record<RegimeLabel, number> = { bull: 0, neutral: 0, bear: 0 }
    for (const s of state_sequence) {
      if (s.label in counts) counts[s.label as RegimeLabel]++
    }
    return { totalDays: state_sequence.length, daysByLabel: counts }
  }, [state_sequence])

  // --- Sort state_params by vol_mean ascending (bull first) ---
  const sortedParams = useMemo<StateParam[]>(
    () => [...state_params].sort((a, b) => a.vol_mean - b.vol_mean),
    [state_params],
  )

  // --- Transition matrix remapped to bull/neutral/bear order ---
  const displayMatrix = useMemo(() => {
    const stateForLabel = (label: RegimeLabel) =>
      state_params.find(p => p.label === label)!.state
    return LABEL_ORDER.map(fromLabel => {
      const fromIdx = stateForLabel(fromLabel)
      return LABEL_ORDER.map(toLabel => {
        const toIdx = stateForLabel(toLabel)
        const row = transition_matrix[fromIdx]
        return row ? (row[toIdx] ?? 0) : 0
      })
    })
  }, [state_params, transition_matrix])

  function cellBg(val: number, fromLabel: RegimeLabel) {
    if (val > 0.8) {
      const color = HMM_COLORS[fromLabel]
      // Return inline style with the color at low opacity
      return color
    }
    return null
  }

  const retColor = (v: number) => {
    if (v > 0.02) return HMM_COLORS.bull
    if (v < -0.02) return HMM_COLORS.bear
    return '#94a3b8'
  }

  return (
    <div className="flex flex-col bg-panel h-full">

      {/* Section 1: Current state header */}
      <div className="px-4 py-3 bg-card border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-t2">
            Current Regime
          </span>
        </div>

        <div className="flex items-center gap-3 mb-2.5">
          {currentLabel && <StateBadge label={currentLabel} />}
          <span className="text-[10px] font-mono text-t3">{currentState?.date ?? effectiveDate}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] font-sans uppercase tracking-widest text-t3">Last Close</div>
            <div className="font-mono text-[12px] text-t1 font-medium">
              ${metadata.last_close?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-sans uppercase tracking-widest text-t3">Day Chg</div>
            <div
              className="font-mono text-[12px] font-medium"
              style={{ color: retColor(metadata.day_change ?? 0) }}
            >
              {metadata.day_change != null
                ? `${metadata.day_change >= 0 ? '+' : ''}${metadata.day_change.toFixed(2)}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-sans uppercase tracking-widest text-t3">Day %</div>
            <div
              className="font-mono text-[12px] font-medium"
              style={{ color: retColor(metadata.day_pct ?? 0) }}
            >
              {metadata.day_pct != null
                ? `${metadata.day_pct >= 0 ? '+' : ''}${(metadata.day_pct * 100).toFixed(2)}%`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: State parameters table */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border">
          <span className="text-[10px] font-sans font-medium uppercase tracking-widest text-t2">
            State Parameters
          </span>
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue/10 text-blue border border-blue/20">
            {metadata.n_states}
          </span>
        </div>

        <table className="w-full border-collapse">
          <thead className="bg-card">
            <tr className="border-b border-border">
              <th className="text-left pl-4 pr-1 py-1.5 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">State</th>
              <th className="text-right px-1 py-1.5 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">Days%</th>
              <th className="text-right px-1 py-1.5 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">Ret Ann</th>
              <th className="text-right px-1 py-1.5 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">Vol Ann</th>
              <th className="text-right pl-1 pr-4 py-1.5 text-[9px] font-sans uppercase tracking-widest text-t3 font-medium">Avg Vol</th>
            </tr>
          </thead>
          <tbody>
            {sortedParams.map((sp) => {
              const label = sp.label as RegimeLabel
              const color = HMM_COLORS[label]
              const daysFrac = totalDays > 0 ? daysByLabel[label] / totalDays : 0
              const avgVolAnn = sp.vol_mean * Math.sqrt(252) * 100
              return (
                <tr
                  key={sp.state}
                  className="border-b border-border/30 last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="pl-4 pr-1 py-2">
                    <span
                      className="inline-block font-mono text-[11px] font-semibold capitalize"
                      style={{ color }}
                    >
                      {label}
                    </span>
                  </td>
                  <td className="px-1 py-2 font-mono text-right text-[11px] tabular-nums text-t2">
                    {pct(daysFrac)}
                  </td>
                  <td
                    className="px-1 py-2 font-mono text-right text-[11px] font-medium tabular-nums"
                    style={{ color: retColor(sp.mean_annual) }}
                  >
                    {sp.mean_annual >= 0 ? '+' : ''}{(sp.mean_annual * 100).toFixed(1)}%
                  </td>
                  <td className="px-1 py-2 font-mono text-right text-[11px] tabular-nums text-t2">
                    {(sp.std_annual * 100).toFixed(1)}%
                  </td>
                  <td className="pl-1 pr-4 py-2 font-mono text-right text-[11px] tabular-nums text-t2">
                    {avgVolAnn.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Section 3: Transition matrix */}
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <div className="text-[10px] font-sans font-medium uppercase tracking-widest text-t2 mb-2">
          Transition Matrix
          <span className="ml-2 text-[9px] font-normal normal-case tracking-normal text-t3">
            P(row → col)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] font-mono">
            <thead>
              <tr>
                <th className="pb-1 pr-2 text-left text-[9px] text-t3 font-normal">From \ To</th>
                {LABEL_ORDER.map(label => (
                  <th
                    key={label}
                    className="pb-1 px-1 text-center text-[9px] font-semibold capitalize"
                    style={{ color: HMM_COLORS[label] }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LABEL_ORDER.map((fromLabel, ri) => (
                <tr key={fromLabel}>
                  <td
                    className="pr-2 py-1 text-[9px] font-semibold capitalize"
                    style={{ color: HMM_COLORS[fromLabel] }}
                  >
                    {fromLabel}
                  </td>
                  {displayMatrix[ri].map((val, ci) => {
                    const bgColor = cellBg(val, fromLabel)
                    const isLow = val < 0.1
                    return (
                      <td
                        key={ci}
                        className="px-1 py-1 text-center tabular-nums rounded"
                        style={{
                          backgroundColor: bgColor ? `${bgColor}40` : undefined,
                          color: isLow ? '#4b6280' : '#cbd5e1',
                          fontWeight: val > 0.8 ? 600 : 400,
                        }}
                      >
                        {(val * 100).toFixed(1)}%
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Model info footer */}
      <div className="px-4 py-3 bg-card border-t border-border flex-shrink-0 mt-auto">
        <div className="text-[9px] font-sans font-semibold uppercase tracking-widest text-t3 mb-1.5">
          About this model
        </div>
        <p className="text-[10px] font-sans text-t3 leading-relaxed">
          <span className="text-t2 font-medium">GaussianHMM</span> · {metadata.n_states} states ·
          2D features [log-return, realized vol₂₁]
        </p>
        <p className="text-[10px] font-sans text-t3 leading-relaxed mt-0.5">
          State alignment: sorted by rolling volatility (low vol = bull)
        </p>
      </div>

    </div>
  )
}
export default memo(HMMStateStatsPanel)
