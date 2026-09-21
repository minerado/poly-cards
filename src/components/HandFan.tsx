import type { CSSProperties } from "react";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";

interface HandFanProps {
  cards: CardInstance[];
  onCardClick?: (instanceId: string) => void;
  actionLabel?: string;
  /** Renders every card as a back, and disables hover/click entirely (the opponent's hand). */
  faceDown?: boolean;
}

const MAX_ROTATION = 6;
const ROTATION_STEP = 4;
const RISE_FACTOR = 4;

export function HandFan({ cards, onCardClick, actionLabel, faceDown }: HandFanProps) {
  const center = (cards.length - 1) / 2;

  return (
    <div className={`hand-fan ${faceDown ? "hand-fan--static" : ""}`}>
      {cards.map((card, index) => {
        const offset = index - center;
        const rotate = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offset * ROTATION_STEP));
        // Edge cards sit on the tray's baseline; the center card rises above
        // it, forming a dome. Nothing ever moves below baseline, so the fan
        // can't clip past the (viewport-flush) bottom of the tray.
        const dropPx = -(center * center - offset * offset) * RISE_FACTOR;
        const style = {
          "--rotate": `${rotate}deg`,
          "--drop": `${dropPx}px`,
          zIndex: index,
        } as CSSProperties;

        return (
          <div className="hand-fan__slot" style={style} key={card.instanceId}>
            <CardView
              card={card}
              variant="hand"
              faceDown={faceDown}
              onClick={!faceDown && onCardClick ? () => onCardClick(card.instanceId) : undefined}
              actionLabel={actionLabel}
            />
          </div>
        );
      })}
    </div>
  );
}
