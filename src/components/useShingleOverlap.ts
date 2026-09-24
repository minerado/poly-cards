import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { shingleOverlap } from "./shingleLayout";

/**
 * Live overlap (px) for a lane's tokens, tracking the lane's actual
 * available width via ResizeObserver — see shingleLayout's own comment for
 * the math. `useLayoutEffect` (not `useEffect`) so the very first render at
 * a given item count settles on its final overlap before paint, rather
 * than flashing un-shingled for one frame; a genuine resize is rare enough
 * that the ResizeObserver's own (async) callback settling one frame later
 * doesn't read as a flash.
 */
export function useShingleOverlap(
  containerRef: RefObject<HTMLElement | null>,
  itemCount: number,
  itemWidth: number,
  baseGap: number,
  minPeek: number,
): number {
  const [overlap, setOverlap] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setOverlap(shingleOverlap(itemCount, itemWidth, baseGap, el.clientWidth, minPeek));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, itemCount, itemWidth, baseGap, minPeek]);

  return overlap;
}
