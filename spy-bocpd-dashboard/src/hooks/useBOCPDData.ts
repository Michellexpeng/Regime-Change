import { useState, useCallback } from 'react'
import type { BOCPDData } from '../types/bocpd'
import staticData from '../data/bocpd_data.json'

const API_BASE = 'https://regime-change.onrender.com'

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

export function useBOCPDData(): UseBOCPDDataReturn {
  const [data,    setData]    = useState<BOCPDData>(staticData as BOCPDData)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async (params: FetchParams) => {
    setLoading(true)
    setError(null)

    const url = new URL(`${API_BASE}/bocpd`)
    url.searchParams.set('ticker',    params.ticker)
    url.searchParams.set('start',     params.start)
    url.searchParams.set('end',       params.end)
    url.searchParams.set('lambda',    String(params.lambda))
    url.searchParams.set('threshold', String(params.threshold))

    try {
      const res = await fetch(url.toString())
      const json = await res.json() as BOCPDData & { error?: string }

      if (!res.ok || json.error) {
        setError(json.error ?? `Server error (${res.status})`)
        return
      }

      setData(json)
    } catch {
      setError('Cannot reach API server. Run: python scripts/server.py')
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetch: fetchData }
}
