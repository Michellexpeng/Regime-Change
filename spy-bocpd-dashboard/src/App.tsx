import { useState, useCallback } from 'react'
import { useBOCPDData } from './hooks/useBOCPDData'
import { useHMMData } from './hooks/useHMMData'
import type { HMMData } from './types/hmm'
import ControlBar from './components/ControlBar'
import KPIBar from './components/KPIBar'
import PriceChangepointTimeline from './components/PriceChangepointTimeline'
import SegmentStatsPanel from './components/SegmentStatsPanel'

const TODAY = new Date().toISOString().slice(0, 10)

export default function App() {
  const { data, loading, error, fetch } = useBOCPDData()
  const { data: hmmData, loading: hmmLoading, error: hmmError, fetch: fetchHMM } = useHMMData()
  const [method, setMethod] = useState<'bocpd' | 'hmm'>('bocpd')

  const activeLoading = method === 'hmm' ? hmmLoading : loading
  const activeError   = method === 'hmm' ? hmmError   : error

  const displaySegments    = method === 'hmm' && hmmData ? hmmData.regime_segments : data.regime_segments
  const displayChangepoints = method === 'hmm' && hmmData ? hmmData.changepoints   : data.changepoints

  const ticker   = data.metadata.ticker ?? 'SPY'
  const lastDate = data.prices[data.prices.length - 1]?.date ?? ''

  // hoverDate: live mouse position on chart (null when not hovering)
  // focusDate: brush end position (persists after mouse leaves)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [focusDate, setFocusDate] = useState<string>('')

  // Sidebar shows hover > brush end > dataset end
  const effectiveFocusDate = hoverDate ?? (focusDate || lastDate)

  const handleFocusDate = useCallback((date: string) => setFocusDate(date), [])
  const handleHoverDate = useCallback((date: string | null) => setHoverDate(date), [])

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">

      <ControlBar
        defaults={{ ticker, start: '2016-01-01', end: TODAY, lambda: data.metadata.lambda ?? 250, threshold: data.metadata.threshold ?? 0.8, method: 'bocpd' }}
        loading={activeLoading}
        onSubmit={(p) => {
          setFocusDate('')
          setMethod(p.method)
          if (p.method === 'hmm') {
            fetchHMM({ ticker: p.ticker, start: p.start, end: p.end })
          } else {
            fetch(p)
          }
        }}
      />

      {/* Loading overlay */}
      {activeLoading && (
        <div className="absolute inset-0 z-50 bg-bg/80 flex flex-col items-center justify-center gap-4">
          <svg className="animate-spin w-8 h-8 text-blue" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div className="text-t2 text-sm font-mono">Running {method.toUpperCase()} algorithm…</div>
          <div className="text-t3 text-[11px] font-mono">This may take 20–40 seconds for large date ranges</div>
        </div>
      )}

      {/* Error banner */}
      {activeError && (
        <div className="flex items-center gap-3 px-4 py-2 bg-red-dim border-b border-red/30 text-red text-[12px] font-mono flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="6" />
            <line x1="7" y1="4" x2="7" y2="7.5" />
            <circle cx="7" cy="9.5" r="0.6" fill="currentColor" />
          </svg>
          {activeError}
          <button className="ml-auto text-red/60 hover:text-red" onClick={() => window.location.reload()}>
            dismiss
          </button>
        </div>
      )}

      {/* Main — left charts + right sidebar */}
      <div className="flex flex-1 min-h-0">

        {/* Left: all chart panels */}
        <div className="flex flex-col flex-1 min-w-0">
          <PriceChangepointTimeline
            data={data}
            onFocusDateChange={handleFocusDate}
            onHoverDateChange={handleHoverDate}
          />
        </div>

        {/* Right sidebar — KPI + segment stats */}
        <div className="flex flex-col w-[300px] flex-shrink-0 border-l border-border">
          <KPIBar data={data} focusDate={effectiveFocusDate} isHovering={hoverDate !== null} />
          <div className="flex-1 min-h-0">
            <SegmentStatsPanel data={data} focusDate={effectiveFocusDate} />
          </div>
        </div>

      </div>
    </div>
  )
}
