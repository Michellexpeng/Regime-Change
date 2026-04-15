import { useState, useCallback } from 'react'
import type { HMMData } from '../types/hmm'
import staticData from '../data/hmm_data.json'
import { fetchWithRetry } from '../utils/fetchWithRetry'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8765'

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

export function useHMMData(): UseHMMDataReturn {
  const [data,    setData]    = useState<HMMData>(staticData as HMMData)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async (params: HMMFetchParams) => {
    setLoading(true)
    setError(null)

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
