import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { BOCPDData } from '../types/bocpd'
import { downsample } from '../utils/downsample'
import { AXIS_STYLE, GRID_STYLE } from '../theme/chartStyles'
import { COLORS } from '../theme/colors'

interface Props {
  data: BOCPDData
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded px-3 py-2 text-xs font-mono">
      <div className="text-t3 mb-1">{label}</div>
      <div className="text-blue">{payload[0]?.value} days</div>
    </div>
  )
}

export default function RunLengthMap({ data }: Props) {
  const { run_length_map, changepoints } = data

  // Always keep changepoint dates so drops align exactly with the x-axis position
  const anchors = new Set(changepoints.map(cp => cp.date))
  const displayData = downsample(run_length_map, 600, anchors, d => d.date)

  return (
    <div className="flex flex-col bg-panel h-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-t3" />
        <span className="text-[11px] uppercase tracking-widest text-t2 font-medium">
          Run Length  argmax(t)
        </span>
      </div>

      <div className="flex-1 min-h-0 px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              height={18}
              tickFormatter={(v: string) => v.slice(0, 4)}
              ticks={displayData
                .filter((d, i) => i === 0 || d.date.slice(0, 4) !== displayData[i - 1].date.slice(0, 4))
                .map(d => d.date)}
            />
            <YAxis
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              width={40}
              label={{
                value: 'days',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 9, fill: COLORS.muted, fontFamily: "'JetBrains Mono',monospace" },
              }}
            />
            <Tooltip content={<TooltipContent />} />

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

      <div className="px-3 pb-2 flex-shrink-0">
        <div className="text-[9px] font-mono text-t3">days since last changepoint — drops mark detected changepoints</div>
      </div>
    </div>
  )
}
