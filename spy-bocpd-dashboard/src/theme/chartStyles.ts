/**
 * Shared Recharts axis and grid style props.
 * Import these instead of defining inline per-component.
 */
export const AXIS_STYLE = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  fill: '#6b849e',
} as const;

export const GRID_STYLE = {
  stroke: '#1e2d45',
  strokeDasharray: '2 4',
} as const;

/** Chart panel heights (px) */
export const PANEL_HEIGHT = {
  SIGNAL: 84,
  RUN_LENGTH: 104,
  STATE_PROBS: 100,
  CONFIDENCE: 88,
} as const;
