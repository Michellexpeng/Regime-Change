import { useSyncExternalStore } from 'react'

type Listener = () => void

let _date: string | null = null
const _listeners = new Set<Listener>()

/**
 * Lightweight external store for the chart hover date.
 * Writing to it does NOT trigger an App re-render — only components
 * that call useHoverDate() will re-render.
 */
export const hoverStore = {
  set(date: string | null) {
    if (date === _date) return   // skip no-op (recharts fires mousemove on same point)
    _date = date
    _listeners.forEach(l => l())
  },
  get(): string | null { return _date },
  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => _listeners.delete(listener)
  },
}

export function useHoverDate(): string | null {
  return useSyncExternalStore(hoverStore.subscribe, hoverStore.get)
}
