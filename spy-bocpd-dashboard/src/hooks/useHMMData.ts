import { useState, useCallback } from 'react'
import type { HMMData } from '../types/hmm'
import staticData from '../data/hmm_data.json'
import { fetchWithRetry } from '../utils/fetchWithRetry'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8765'

// Quick tickers that have pre-computed static JSON in public/data/
const STATIC_TICKERS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'TSLA', 'NVDA', 'GLD'])
const DEFAULT_START  = '2016-01-01'
const STATIC_LAST_DATE = '2026-04-15'   // last date in pre-computed JSONs

export interface HMMFetchParams {
  ticker: string
  start: string
  end: string
}

export interface UseHMMDataReturn {
  data: HMMData
  loading: boolean
  error: string | null
  fetch: (params: HMMFetchParams) => Promise<void>
}

function canUseStatic(params: HMMFetchParams): boolean {
  return (
    params.start === DEFAULT_START &&
    params.end   <= STATIC_LAST_DATE
  )
}

export function useHMMData(): UseHMMDataReturn {
  const [data,    setData]    = useState<HMMData>(staticData as HMMData)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async (params: HMMFetchParams) => {
    setLoading(true)
    setError(null)

    // Use pre-computed static JSON for quick tickers with default params
    if (STATIC_TICKERS.has(params.ticker) && canUseStatic(params)) {
      try {
        const res  = await fetch(`/data/hmm_${params.ticker}.json`)
        const json = await res.json() as HMMData
        setData(json)
        return
      } catch {
        // fall through to API if static file fails
      } finally {
        setLoading(false)
      }
    }

    // Fall back to live API for custom params or unknown tickers
    const url = new URL(`${API_BASE}/hmm`)
    url.searchParams.set('ticker', params.ticker)
    url.searchParams.set('start',  params.start)
    url.searchParams.set('end',    params.end)

    try {
      const res  = await fetchWithRetry(url.toString())
      const json = await res.json() as HMMData & { error?: string }

      if (!res.ok || json.error) {
        setError(json.error ?? `Server error (${res.status})`)
        return
      }

      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetch: fetchData }
}
