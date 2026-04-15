/**
 * Reduces a data array to at most `maxPoints` evenly-spaced entries.
 * Optionally preserves entries whose dates appear in `anchors`
 * (e.g. changepoints that must stay on the x-axis).
 */
export function downsample<T>(
  data: T[],
  maxPoints: number,
  anchors?: Set<string>,
  getDate?: (d: T) => string,
): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter(
    (d, i) =>
      i % step === 0 ||
      i === data.length - 1 ||
      (anchors && getDate ? anchors.has(getDate(d)) : false),
  );
}
