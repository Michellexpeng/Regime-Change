import { useState, useCallback } from 'react'
import type { BOCPDData } from '../types/bocpd'
import staticData from '../data/bocpd_data.json'
import { fetchWithRetry } from '../utils/fetchWithRetry'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8765'

// Quick tickers that have pre-computed static JSON in public/data/
const STATIC_TICKERS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'TSLA', 'NVDA', 'GLD'])
const DEFAULT_LAMBDA    = 250
const DEFAULT_THRESHOLD = 0.8
const DEFAULT_START     = '2016-01-01'

export interface FetchParams {
  ticker: string
  start: string
  end: string
  lambda: number
  threshold: number
}

export interface UseBOCPDDataReturn {
  data: BOCPDData
  loading: boolean
  error: string | null
  fetch: (params: FetchParams) => Promise<void>
}

function isDefaultParams(params: FetchParams): boolean {
  return (
    params.lambda    === DEFAULT_LAMBDA    &&
    params.threshold === DEFAULT_THRESHOLD &&
    params.start     === DEFAULT_START
  )
}

export function useBOCPDData(): UseBOCPDDataReturn {
  const [data,    setData]    = useState<BOCPDData>(staticData as BOCPDData)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async (params: FetchParams) => {
    setLoading(true)
    setError(null)

    // Use pre-computed static JSON for quick tickers with default params
    if (STATIC_TICKERS.has(params.ticker) && isDefaultParams(params)) {
      try {
        const res  = await fetch(`/data/bocpd_${params.ticker}.json`)
        const json = await res.json() as BOCPDData
        setData(json)
        return
      } catch {
        // fall through to API if static file fails
      } finally {
        setLoading(false)
      }
    }

    // Fall back to live API for custom params or unknown tickers
    const url = new URL(`${API_BASE}/bocpd`)
    url.searchParams.set('ticker',    params.ticker)
    url.searchParams.set('start',     params.start)
    url.searchParams.set('end',       params.end)
    url.searchParams.set('lambda',    String(params.lambda))
    url.searchParams.set('threshold', String(params.threshold))

    try {
      const res = await fetchWithRetry(url.toString())
      const json = await res.json() as BOCPDData & { error?: string }

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
