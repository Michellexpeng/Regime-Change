export interface StatePoint {
  date: string
  state: number
  label: 'bear' | 'neutral' | 'bull'
}

export interface StateParam {
  state: number
  label: 'bear' | 'neutral' | 'bull'
  mean_annual: number
  std_annual: number
  vol_mean: number
}

export interface HMMSegment {
  id: number
  label: 'bear' | 'neutral' | 'bull'
  start: string
  end: string
  n_days: number
  mean_return_annual: number
  std_annual: number
}

export interface HMMData {
  metadata: {
    ticker?: string
    n_states: number
    n_changepoints: number
    converged: boolean
    last_updated: string
    last_close: number
    day_change: number
    day_pct: number
  }
  prices: Array<{ date: string; close: number }>
  changepoints: Array<{ date: string; index: number }>
  regime_segments: HMMSegment[]
  state_sequence: StatePoint[]
  state_params: StateParam[]
  transition_matrix: number[][]
}
