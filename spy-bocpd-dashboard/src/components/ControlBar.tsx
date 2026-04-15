import { useState, useCallback, FormEvent } from 'react'
import { InfoTooltip } from './InfoTooltip'

export interface QueryParams {
  ticker: string
  start: string
  end: string
  lambda: number
  threshold: number
  method: 'bocpd' | 'hmm'
}

interface Props {
  defaults: QueryParams
  loading: boolean
  onSubmit: (params: QueryParams) => void
}

const QUICK_TICKERS  = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'TSLA', 'NVDA', 'GLD']
const QUICK_LAMBDAS  = [100, 250, 500]
// Threshold slider: 0.50 → 0.95 step 0.05
const THR_MIN  = 0.50
const THR_MAX  = 0.95
const THR_STEP = 0.05

export default function ControlBar({ defaults, loading, onSubmit }: Props) {
  const [ticker,    setTicker]    = useState(defaults.ticker)
  const [start,     setStart]     = useState(defaults.start)
  const [end,       setEnd]       = useState(defaults.end)
  const [lambda,    setLambda]    = useState(String(defaults.lambda))
  const [threshold, setThreshold] = useState(String(defaults.threshold))
  const [method,    setMethod]    = useState<'bocpd' | 'hmm'>(defaults.method ?? 'bocpd')

  // Lambda: text field, empty → use default
  const lambdaNum   = lambda === '' ? defaults.lambda : parseInt(lambda)
  const lambdaValid = lambda === '' || (!isNaN(lambdaNum) && lambdaNum > 0 && lambdaNum <= 2000)

  // Threshold: driven by slider, always a valid float in [THR_MIN, THR_MAX]
  const thresholdNum = parseFloat(threshold)

  const canSubmit = !loading && !!ticker.trim() && start < end && lambdaValid

  const setThrFromSlider = useCallback((v: string) => setThreshold(parseFloat(v).toFixed(2)), [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      ticker:    ticker.toUpperCase().trim(),
      start,
      end,
      lambda:    lambdaNum,
      threshold: thresholdNum,
      method,
    })
  }

  const inputBase =
    'bg-bg border border-border rounded px-2.5 py-1 text-[12px] font-mono text-t1 ' +
    'focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/30 ' +
    'placeholder:text-t3 transition-colors disabled:opacity-50'

  const invalidInput = 'border-red/60 focus:border-red focus:ring-red/20'

  return (
    <div className="flex items-center gap-3 px-4 h-[44px] bg-card border-b border-border flex-shrink-0">
      {/* Brand */}
      <span className="text-[11px] uppercase tracking-[0.12em] text-t3 font-medium mr-1 whitespace-nowrap">
        Bayesian Regime Detector
      </span>

      <div className="flex gap-0.5 bg-bg border border-border rounded p-0.5" role="group" aria-label="Detection method">
        {(['bocpd', 'hmm'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMethod(m)
              if (m !== method && !loading && ticker.trim() && start < end && lambdaValid) {
                onSubmit({ ticker: ticker.toUpperCase().trim(), start, end, lambda: lambdaNum, threshold: thresholdNum, method: m })
              }
            }}
            disabled={loading}
            aria-pressed={method === m}
            aria-label={`Switch to ${m.toUpperCase()} detection method`}
            className={`px-2.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
              method === m
                ? 'bg-blue text-white'
                : 'text-t3 hover:text-t2'
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-border" />

      <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-1 min-w-0">
        {/* Ticker */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-widest text-t3 whitespace-nowrap">Ticker</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="SPY"
            className={`${inputBase} w-[68px] uppercase`}
            disabled={loading}
          />
        </div>

        {/* Quick-select chips */}
        <div className="flex gap-1">
          {QUICK_TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTicker(t)}
              disabled={loading}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                ticker === t
                  ? 'bg-blue-dim border-blue text-blue'
                  : 'bg-bg border-border text-t3 hover:border-t3 hover:text-t2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-widest text-t3">From</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`${inputBase} w-[126px]`}
            disabled={loading}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-widest text-t3">To</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={`${inputBase} w-[126px]`}
            disabled={loading}
          />
        </div>

        {method === 'bocpd' && (
          <>
            <div className="w-px h-4 bg-border" />

            {/* Lambda — number input + quick chips */}
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-sans uppercase tracking-widest text-t3 whitespace-nowrap">λ</label>
              <InfoTooltip
                text="Expected number of trading days between changepoints. Sets the geometric prior hazard rate H = 1/λ. Larger λ → rarer changepoints → smoother segmentation. Default: 250 (~1 year)."
                width={260}
              />
              {/* Quick-select chips */}
              <div className="flex gap-0.5">
                {QUICK_LAMBDAS.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLambda(String(l))}
                    disabled={loading}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                      lambdaNum === l
                        ? 'bg-blue-dim border-blue text-blue'
                        : 'bg-bg border-border text-t3 hover:border-t3 hover:text-t2'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Custom value input */}
              <input
                type="number"
                value={lambda}
                step="any"
                placeholder={String(defaults.lambda)}
                onChange={(e) => setLambda(e.target.value)}
                className={`${inputBase} w-[56px] ${!lambdaValid ? invalidInput : ''}`}
                disabled={loading}
              />
            </div>

            {/* Threshold — slider, bounded 0.50–0.95 */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-sans uppercase tracking-widest text-t3 whitespace-nowrap">Thr</label>
              <InfoTooltip
                text="Detection threshold for the regime-change signal. A changepoint is declared when the probability that a new regime started within the last 10 days exceeds this value. Higher → fewer but more confident detections. Default: 0.8."
                width={260}
              />
              <input
                type="range"
                min={THR_MIN}
                max={THR_MAX}
                step={THR_STEP}
                value={thresholdNum}
                onChange={(e) => setThrFromSlider(e.target.value)}
                className="w-[80px]"
                disabled={loading}
              />
              {/* Live value badge */}
              <span className={`font-mono text-[11px] font-medium w-[30px] text-center tabular-nums ${
                thresholdNum >= 0.9 ? 'text-green' : thresholdNum <= 0.6 ? 'text-amber' : 'text-blue'
              }`}>
                {thresholdNum.toFixed(2)}
              </span>
            </div>
          </>
        )}

        {/* Apply */}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Apply parameters and run detection"
          className={`flex items-center gap-2 px-4 py-1 rounded text-[12px] font-medium transition-all whitespace-nowrap ${
            loading
              ? 'bg-blue-dim text-blue border border-blue/30 cursor-not-allowed'
              : canSubmit
              ? 'bg-blue text-white hover:bg-blue/80 active:scale-95'
              : 'bg-blue-dim text-t3 border border-border cursor-not-allowed'
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Running…
            </>
          ) : (
            'Apply'
          )}
        </button>
      </form>

      <div className="text-[10px] text-t3 font-mono whitespace-nowrap">API :8765</div>
    </div>
  )
}
