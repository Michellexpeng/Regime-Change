import { useState, useCallback, useMemo, memo } from 'react'
import {
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Brush,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { BOCPDData, Changepoint } from '../types/bocpd'
import { InfoTooltip } from './InfoTooltip'
import { hoverStore } from '../hooks/hoverStore'
import { downsample } from '../utils/downsample'
import { AXIS_STYLE, GRID_STYLE, PANEL_HEIGHT } from '../theme/chartStyles'
import { COLORS } from '../theme/colors'

interface Props {
  data: BOCPDData
  onFocusDateChange?: (date: string) => void
}

export const PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16',
  '#14b8a6', '#6366f1', '#ef4444', '#eab308',
]

export function segColor(i: number) {
  return PALETTE[i % PALETTE.length]
}


function PriceTooltip({
  active, payload, label, threshold,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number | null; color: string }[]
  label?: string
  threshold: number
}) {
  if (!active || !payload?.length) return null
  const priceEntry = payload.find(p => p.dataKey.startsWith('c') && p.value != null)
  const signalEntry = payload.find(p => p.dataKey === 'prob')
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono space-y-1 shadow-xl">
      <div className="text-t3 font-sans text-[10px]">{label}</div>
      {priceEntry && (
        <div style={{ color: priceEntry.color }} className="font-medium">
          ${priceEntry.value?.toFixed(2)}
        </div>
      )}
      {signalEntry && signalEntry.value != null && (
        <div className={signalEntry.value >= threshold ? 'text-red' : 'text-amber'}>
          signal {(signalEntry.value * 100).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function RunLengthTooltip({
  active, payload, label,
}: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono shadow-xl">
      <div className="text-t3 font-sans text-[10px] mb-1">{label}</div>
      <div className="text-blue">{payload[0]?.value} <span className="text-t3">days</span></div>
    </div>
  )
}


function PriceChangepointTimeline({ data, onFocusDateChange }: Props) {
  const { prices, short_run_prob, changepoints, regime_segments, run_length_map, metadata } = data
  const segCount = regime_segments.length

  // Merged rows: c0…cN (per-segment price, null when inactive), prob, run_length
  const merged = useMemo(() => {
    return prices.map((p, i) => {
      const prob       = short_run_prob[i]?.prob  ?? 0
      const run_length = run_length_map[i]?.run_length ?? 0

      let segIdx = 0
      for (let s = 0; s < segCount; s++) {
        if (p.date >= regime_segments[s].start) segIdx = s
      }

      const row: Record<string, number | null | string> = { date: p.date, prob, run_length }
      for (let s = 0; s < segCount; s++) {
        if (s === segIdx) {
          row[`c${s}`] = p.close
        } else if (s === segIdx - 1 && p.date === regime_segments[segIdx].start) {
          row[`c${s}`] = p.close   // boundary: include in ending segment too
        } else {
          row[`c${s}`] = null
        }
      }
      return row
    })
  }, [prices, short_run_prob, run_length_map, regime_segments, segCount])

  const cpAnchors = useMemo(
    () => new Set([
      ...changepoints.map(cp => cp.date),
      ...regime_segments.map(s => s.start),
    ]),
    [changepoints, regime_segments],
  )

  const displayData = useMemo(
    () => downsample(merged, 700, cpAnchors, d => d.date as string),
    [merged, cpAnchors],
  )

  const [brushRange, setBrushRange] = useState<[number, number]>([0, displayData.length - 1])

  const handleBrush = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      const s = range.startIndex ?? 0
      const e = range.endIndex   ?? displayData.length - 1
      setBrushRange([s, e])
      const endDate = displayData[e]?.date as string | undefined
      if (endDate) onFocusDateChange?.(endDate)
    },
    [displayData, onFocusDateChange],
  )

  // Signal and run-length panels are sliced to brush window
  const slicedData = useMemo(
    () => displayData.slice(brushRange[0], brushRange[1] + 1),
    [displayData, brushRange],
  )

  const xTicks = useMemo(() =>
    displayData
      .filter((d, i) => i === 0 || String(d.date).slice(0, 4) !== String(displayData[i - 1].date).slice(0, 4))
      .map(d => d.date as string),
    [displayData],
  )

  const slicedXTicks = useMemo(() =>
    slicedData
      .filter((d, i) => i === 0 || String(d.date).slice(0, 4) !== String(slicedData[i - 1].date).slice(0, 4))
      .map(d => d.date as string),
    [slicedData],
  )

  const cpLines = changepoints.map((cp: Changepoint) => cp.date)

  const handleMouseMove = useCallback((state: { activeLabel?: string }) => {
    const label = state?.activeLabel
    if (label) hoverStore.set(label)
  }, [])

  const handleMouseLeave = useCallback(() => hoverStore.set(null), [])

  return (
    <div className="flex flex-col h-full bg-panel border-b border-border">

      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 py-2.5 bg-card border-b border-border flex-shrink-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse flex-shrink-0 mt-px" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-t2">
              {metadata.ticker ?? 'Price'} — Price &amp; Changepoint Signal
            </span>
            <InfoTooltip
              text="Price colored by detected regime. Vertical red dashes mark changepoints — dates where BOCPD's posterior placed high probability on a new run beginning."
              width={260}
            />
          </div>
          <p className="text-[10px] text-t3 font-sans mt-0.5 ml-3.5 leading-snug">
            Each color = one regime segment &nbsp;·&nbsp; Red dashes = detected changepoints &nbsp;·&nbsp; Drag brush to zoom
          </p>
        </div>

        {/* Segment legend */}
        <div className="flex items-center gap-2 flex-wrap justify-end max-w-[340px]">
          {regime_segments.map((seg, i) => (
            <div key={seg.id} className="flex items-center gap-1" title={`Seg #${seg.id}  ${seg.start} – ${seg.end}`}>
              <span className="w-4 h-0.5 rounded flex-shrink-0" style={{ background: segColor(i) }} />
              <span className="text-[9px] font-mono text-t3">#{seg.id}</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── Panel 1: Price + Brush ── */}
      <div className="flex-1 min-h-0 px-2 pt-1.5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={displayData}
            margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
            syncId="bocpd"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={(v: string) => v.slice(0, 4)}
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              height={18}
            />
            <YAxis
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v: number) => `$${v}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<PriceTooltip threshold={metadata.threshold} />} />

            {cpLines.map((date, i) => (
              <ReferenceLine
                key={i}
                x={date}
                stroke={COLORS.red}
                strokeWidth={1}
                strokeDasharray="3 4"
                label={{ value: 'CP', position: 'top', fontSize: 8, fill: COLORS.red, fontFamily: "'JetBrains Mono',monospace" }}
              />
            ))}

            {regime_segments.map((seg, i) => (
              <Line
                key={seg.id}
                type="monotone"
                dataKey={`c${i}`}
                stroke={segColor(i)}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 3, fill: segColor(i) }}
                isAnimationActive={false}
              />
            ))}

            <Brush
              dataKey="date"
              height={16}
              stroke="#1e2d45"
              fill="#0b0f19"
              travellerWidth={6}
              onChange={handleBrush}
              startIndex={brushRange[0]}
              endIndex={brushRange[1]}
              tickFormatter={(v: string) => v.slice(0, 4)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Panel 2: Changepoint Signal ── */}
      <div className="flex flex-col flex-shrink-0 border-t border-border/50" style={{ height: PANEL_HEIGHT.SIGNAL }}>
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-0 flex-shrink-0">
          <span className="text-[9px] font-medium uppercase tracking-widest text-t3">Changepoint Signal</span>
          <InfoTooltip
            text="P(run length < 10) — the posterior probability that fewer than 10 days have elapsed since a changepoint. High values (above threshold) indicate a regime change likely just occurred."
            width={260}
          />
          <span className="text-[9px] font-mono text-t3 ml-auto">P(regime change within last 10 days)  ·  0 – 100%</span>
        </div>
        <div className="flex-1 min-h-0 px-2 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={slicedData} margin={{ top: 2, right: 12, bottom: 0, left: 8 }}>
              <XAxis dataKey="date" hide />
              <YAxis
                domain={[0, 1]}
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const val = (payload[0]?.value as number) ?? 0
                  return (
                    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono shadow-xl">
                      <div className="text-t3 font-sans text-[10px] mb-1">{label}</div>
                      <div className={val >= metadata.threshold ? 'text-red font-medium' : 'text-amber'}>
                        {(val * 100).toFixed(1)}%
                      </div>
                    </div>
                  )
                }}
              />
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <ReferenceLine
                y={metadata.threshold}
                stroke={COLORS.red}
                strokeWidth={0.8}
                strokeDasharray="4 4"
                label={{ value: `thr=${metadata.threshold}`, position: 'insideTopRight', fontSize: 8, fill: COLORS.red, fontFamily: "'JetBrains Mono',monospace" }}
              />
              <Area
                type="monotone"
                dataKey="prob"
                fill="#f59e0b"
                fillOpacity={0.12}
                stroke="#f59e0b"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Panel 3: Run Length argmax ── */}
      <div className="flex flex-col flex-shrink-0 border-t border-border/50" style={{ height: PANEL_HEIGHT.RUN_LENGTH }}>
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-0 flex-shrink-0">
          <span className="text-[9px] font-medium uppercase tracking-widest text-t3">Run Length  argmax(t)</span>
          <InfoTooltip
            text="The most probable run length at each time step — i.e. argmax_r P(r_t = r | data). Drops to near-zero immediately after a detected changepoint, then grows linearly during stable regimes."
            width={260}
          />
          <span className="text-[9px] font-mono text-t3 ml-auto">trading days since last changepoint</span>
        </div>
        <div className="flex-1 min-h-0 px-2 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={slicedData} margin={{ top: 2, right: 12, bottom: 6, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis
                dataKey="date"
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                height={14}
                ticks={slicedXTicks}
                tickFormatter={(v: string) => v.slice(0, 4)}
              />
              <YAxis
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<RunLengthTooltip />} />
              <Line
                type="monotone"
                dataKey="run_length"
                stroke={COLORS.blue}
                strokeWidth={1.4}
                dot={false}
                activeDot={{ r: 3, fill: COLORS.blue }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
export default memo(PriceChangepointTimeline)
