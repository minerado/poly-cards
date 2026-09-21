import type { CSSProperties } from "react";

interface PhaseNarratorProps {
  message: string;
  durationMs: number;
}

/**
 * A brief announcement centered over the board. Never blocks clicks
 * (pointer-events: none) — for autoAdvance phases nothing underneath is
 * interactive anyway, and for Main's "Your Turn" it's meant to fade over
 * an already-usable board. `durationMs` drives both the fade in/hold/fade
 * out timing here and the JS timer that dismisses it in GameBoard, from
 * the same source (the phase's own `narrator.delayMs`), so they can't
 * drift out of sync.
 */
export function PhaseNarrator({ message, durationMs }: PhaseNarratorProps) {
  return (
    <div className="phase-narrator">
      <span
        className="phase-narrator__text"
        style={{ "--narrator-duration": `${durationMs}ms` } as CSSProperties}
      >
        {message}
      </span>
    </div>
  );
}
