export interface PricePoint {
  date: string
  close: number
}

export interface SignalPoint {
  date: string
  prob: number
}

export interface Changepoint {
  date: string
  index: number
}

export interface Segment {
  id: number
  start: string
  end: string
  n_days: number
  mean_return_annual: number
  std_annual: number
}

export interface RunLengthPoint {
  date: string
  run_length: number
}

export interface BOCPDData {
  metadata: {
    ticker?: string
    lambda: number
    threshold: number
    short_window: number
    n_changepoints: number
    last_updated: string
    last_close: number
    day_change: number
    day_pct: number
  }
  prices: PricePoint[]
  short_run_prob: SignalPoint[]
  changepoints: Changepoint[]
  regime_segments: Segment[]
  run_length_map: RunLengthPoint[]
}
