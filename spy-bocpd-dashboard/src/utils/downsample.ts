/**
 * Reduces a data array to at most `maxPoints` evenly-spaced entries.
 * Used to limit the number of data points passed to Recharts.
 */
export function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}
