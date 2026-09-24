/**
 * How much adjacent lane tokens should overlap so `itemCount` of them at
 * `itemWidth` fit within `availableWidth` — 0 (no overlap, just the base
 * gap) while there's room; grows as the lane fills past it. Capped by
 * `minPeek`: however crowded the lane gets, a buried token never loses
 * more than `itemWidth - minPeek` of itself, so its tapped/untapped state
 * (see .card--tapped) always stays legible instead of vanishing entirely
 * under its neighbor.
 */
export function shingleOverlap(
  itemCount: number,
  itemWidth: number,
  baseGap: number,
  availableWidth: number,
  minPeek: number,
): number {
  if (itemCount < 2 || availableWidth <= 0) return 0;
  const naturalWidth = itemCount * itemWidth + (itemCount - 1) * baseGap;
  const overflow = naturalWidth - availableWidth;
  if (overflow <= 0) return 0;
  const perGap = overflow / (itemCount - 1);
  const maxOverlap = itemWidth - minPeek;
  return Math.min(perGap, maxOverlap);
}
