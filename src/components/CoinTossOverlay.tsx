import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Side } from "../game/types";

interface CoinTossOverlayProps {
  firstSide: Side;
  onConfirm: () => void;
}

// How many full spins the coin makes before landing — a whole number of
// turns (360deg) lands showing the front face (player), an extra half
// turn (180deg) lands showing the back face (opponent). The result itself
// is never decided here: firstSide is already fixed in game state (see
// setupGame's coin toss) — this only dramatizes revealing it.
const SPINS = 5;
const FLIP_MS = 1400;

export function CoinTossOverlay({ firstSide, onConfirm }: CoinTossOverlayProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), FLIP_MS);
    return () => clearTimeout(t);
  }, []);

  const finalDeg = SPINS * 360 + (firstSide === "opponent" ? 180 : 0);

  return (
    <div className="coin-toss-overlay">
      <div
        className={`coin ${settled ? "coin--settled" : "coin--flipping"}`}
        style={{ "--coin-final-deg": `${finalDeg}deg` } as CSSProperties}
      >
        <div className="coin__face coin__face--player">YOU</div>
        <div className="coin__face coin__face--opponent">CPU</div>
      </div>

      {/* Reserves its layout space from the first frame (like
          MulliganOverlay's footer) so the coin doesn't shift position once
          the message/button fade in below it. */}
      <div className="coin-toss-overlay__footer">
        <div className={`coin-toss-overlay__reveal ${settled ? "" : "coin-toss-overlay__reveal--hidden"}`}>
          <div className="coin-toss-overlay__message">
            {firstSide === "player" ? "You go first!" : "The opponent goes first."}
          </div>
          <button className="coin-toss-overlay__confirm" onClick={onConfirm}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
