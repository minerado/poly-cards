import { useEffect } from "react";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";

const DRAW_FLIGHT_MS = 900;

interface DrawAnimationProps {
  card: CardInstance;
  onDone: () => void;
}

/**
 * Plays once for a freshly drawn card: flies up from the deck, flips face
 * up while ballooning toward the viewer, then arcs down and shrinks toward
 * the hand tray. `GameBoard` hides the real card from the hand fan for the
 * same duration, so this hands off to it seamlessly once `onDone` fires.
 */
export function DrawAnimation({ card, onDone }: DrawAnimationProps) {
  useEffect(() => {
    const t = setTimeout(onDone, DRAW_FLIGHT_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="draw-flight">
      <div className="draw-flight__card">
        <CardView card={card} variant="mulligan" />
      </div>
    </div>
  );
}
