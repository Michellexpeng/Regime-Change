import { useState, useCallback, useMemo, memo } from 'react'
import {
  ComposedChart,
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { HMMData, RegimeLabel } from '../types/hmm'
import { hoverStore } from '../hooks/hoverStore'
import { downsample } from '../utils/downsample'
import { AXIS_STYLE, GRID_STYLE, PANEL_HEIGHT } from '../theme/chartStyles'
import { COLORS } from '../theme/colors'

const HMM_COLORS: Record<RegimeLabel, string> = {
  bull:    COLORS.green,
  neutral: COLORS.amber,
  bear:    COLORS.red,
} as const

interface MergedRow {
  date: string
  bull_close:    number | null
  neutral_close: number | null
  bear_close:    number | null
  p_bull:    number
  p_neutral: number
  p_bear:    number
  confidence: number
}

interface Props {
  data: HMMData
  onFocusDateChange?: (date: string) => void
}

function PriceTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number | null; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  // Prefer the current state's key: bull > neutral > bear (order matters at boundaries)
  const order: Array<`${RegimeLabel}_close`> = ['bull_close', 'neutral_close', 'bear_close']
  const priceEntry = order
    .map(key => payload.find(p => p.dataKey === key && p.value != null))
    .find(Boolean)
  const regime = priceEntry?.dataKey.replace('_close', '') as RegimeLabel | undefined
  const color  = regime ? HMM_COLORS[regime] : '#94a3b8'
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono space-y-1 shadow-xl">
      <div className="text-t3 font-sans text-[10px]">{label}</div>
      {priceEntry && (
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span style={{ color }}>${priceEntry.value?.toFixed(2)}</span>
        </div>
      )}
      {regime && (
        <div className="capitalize text-t3">{regime}</div>
      )}
    </div>
  )
}

function ProbTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono space-y-1 shadow-xl">
      <div className="text-t3 font-sans text-[10px] mb-1">{label}</div>
      {(['p_bear', 'p_neutral', 'p_bull'] as const).map(key => {
        const entry = payload.find(p => p.dataKey === key)
        if (!entry) return null
        const label_ = key.replace('p_', '') as RegimeLabel
        return (
          <div key={key} style={{ color: HMM_COLORS[label_] }} className="capitalize">
            {label_}: {(entry.value * 100).toFixed(1)}%
          </div>
        )
      })}
    </div>
  )
}

function ConfTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono shadow-xl">
      <div className="text-t3 font-sans text-[10px] mb-1">{label}</div>
      <div className="text-blue">{((payload[0]?.value ?? 0) * 100).toFixed(1)}%</div>
    </div>
  )
}

function HMMPriceRegimeChart({ data, onFocusDateChange }: Props) {
  const merged = useMemo<MergedRow[]>(() => {
    return data.prices.map((p, i) => {
      const seq      = data.state_sequence?.[i]
      const prevSeq  = data.state_sequence?.[i - 1]
      const probs    = data.state_probs?.[i]
      const label    = seq?.label as RegimeLabel | undefined
      const prevLabel = prevSeq?.label as RegimeLabel | undefined
      // At a state boundary, include the transition point in the ending state too
      // so lines connect seamlessly rather than leaving a gap
      const isBoundary = prevLabel !== undefined && prevLabel !== label
      const maxP = Math.max(probs?.bull ?? 0, probs?.neutral ?? 0, probs?.bear ?? 0)
      return {
        date:          p.date,
        bull_close:    (label === 'bull'    || (isBoundary && prevLabel === 'bull'))    ? p.close : null,
        neutral_close: (label === 'neutral' || (isBoundary && prevLabel === 'neutral')) ? p.close : null,
        bear_close:    (label === 'bear'    || (isBoundary && prevLabel === 'bear'))    ? p.close : null,
        p_bull:    probs?.bull    ?? 0,
        p_neutral: probs?.neutral ?? 0,
        p_bear:    probs?.bear    ?? 0,
        confidence: maxP,
      }
    })
  }, [data])

  const cpAnchors = useMemo(
    () => new Set(data.changepoints.map(cp => cp.date)),
    [data.changepoints],
  )

  const displayData = useMemo(
    () => downsample(merged, 700, cpAnchors, d => d.date),
    [merged, cpAnchors],
  )

  const [brushRange, setBrushRange] = useState<[number, number]>([0, displayData.length - 1])

  const handleBrush = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      const s = range.startIndex ?? 0
      const e = range.endIndex   ?? displayData.length - 1
      setBrushRange([s, e])
      const endDate = displayData[e]?.date
      if (endDate) onFocusDateChange?.(endDate)
    },
    [displayData, onFocusDateChange],
  )

  const slicedData = useMemo(
    () => displayData.slice(brushRange[0], brushRange[1] + 1),
    [displayData, brushRange],
  )

  const xTicks = useMemo(() =>
    displayData
      .filter((d, i) => i === 0 || d.date.slice(0, 4) !== displayData[i - 1].date.slice(0, 4))
      .map(d => d.date),
    [displayData],
  )

  const slicedXTicks = useMemo(() =>
    slicedData
      .filter((d, i) => i === 0 || d.date.slice(0, 4) !== slicedData[i - 1].date.slice(0, 4))
      .map(d => d.date),
    [slicedData],
  )

  const ticker = data.metadata.ticker ?? 'SPY'

  return (
    <div className="flex flex-col h-full bg-panel border-b border-border">

      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-2.5 bg-card border-b border-border flex-shrink-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0 mt-px" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-t2">
              {ticker} — HMM 3-State Regime
            </span>
          </div>
          <p className="text-[10px] text-t3 font-sans mt-0.5 ml-3.5 leading-snug">
            Bull (green) · Neutral (amber) · Bear (red) · Drag brush to zoom
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {(['bull', 'neutral', 'bear'] as RegimeLabel[]).map(label => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-4 h-0.5 rounded flex-shrink-0"
                style={{ background: HMM_COLORS[label] }}
              />
              <span className="text-[9px] font-mono capitalize" style={{ color: HMM_COLORS[label] }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Panel 1: Price + Brush */}
      <div className="flex-1 min-h-0 px-2 pt-1.5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={displayData}
            margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
            onMouseMove={(state) => {
              const label = state?.activeLabel as string | undefined
              if (label) hoverStore.set(label)
            }}
            onMouseLeave={() => hoverStore.set(null)}
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
            <Tooltip content={<PriceTooltip />} />

            <Line
              type="monotone"
              dataKey="bull_close"
              stroke={HMM_COLORS.bull}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="neutral_close"
              stroke={HMM_COLORS.neutral}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {/* bear rendered last so its activeDot would win — use false on all,
                tooltip already shows the correct state label and color */}
            <Line
              type="monotone"
              dataKey="bear_close"
              stroke={HMM_COLORS.bear}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              activeDot={false}
              isAnimationActive={false}
            />

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

      {/* Panel 2: State Probabilities */}
      <div className="flex flex-col flex-shrink-0 border-t border-border/50" style={{ height: PANEL_HEIGHT.STATE_PROBS }}>
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-0 flex-shrink-0">
          <span className="text-[9px] font-medium uppercase tracking-widest text-t3">
            State Probabilities
          </span>
          <span className="text-[9px] font-mono text-t3 ml-auto">
            P(bear) + P(neutral) + P(bull) = 1
          </span>
        </div>
        <div className="flex-1 min-h-0 px-2 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={slicedData} margin={{ top: 2, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis
                domain={[0, 1]}
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip content={<ProbTooltip />} />
              <Area
                type="monotone"
                dataKey="p_bear"
                stackId="1"
                fill={HMM_COLORS.bear}
                stroke={HMM_COLORS.bear}
                fillOpacity={0.75}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="p_neutral"
                stackId="1"
                fill={HMM_COLORS.neutral}
                stroke={HMM_COLORS.neutral}
                fillOpacity={0.75}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="p_bull"
                stackId="1"
                fill={HMM_COLORS.bull}
                stroke={HMM_COLORS.bull}
                fillOpacity={0.75}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Panel 3: Model Confidence */}
      <div className="flex flex-col flex-shrink-0 border-t border-border/50" style={{ height: PANEL_HEIGHT.CONFIDENCE }}>
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-0 flex-shrink-0">
          <span className="text-[9px] font-medium uppercase tracking-widest text-t3">
            Model Confidence
          </span>
          <span className="text-[9px] font-mono text-t3 ml-auto">
            max(P(bull), P(neutral), P(bear))
          </span>
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
                domain={[0, 1]}
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip content={<ConfTooltip />} />
              <Line
                type="monotone"
                dataKey="confidence"
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
export default memo(HMMPriceRegimeChart)
