import type { CSSProperties } from "react";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";
import { fanSlot } from "./fanLayout";

interface HandFanProps {
  cards: CardInstance[];
  onCardClick?: (instanceId: string) => void;
  actionLabel?: string;
  /** Renders every card as a back, and disables hover/click entirely (the opponent's hand). */
  faceDown?: boolean;
}

export function HandFan({ cards, onCardClick, actionLabel, faceDown }: HandFanProps) {
  return (
    <div className={`hand-fan ${faceDown ? "hand-fan--static" : ""}`}>
      {cards.map((card, index) => {
        // Edge cards sit on the tray's baseline; the center card rises above
        // it, forming a dome. Nothing ever moves below baseline, so the fan
        // can't clip past the (viewport-flush) bottom of the tray.
        const { rotate, drop } = fanSlot(index, cards.length);
        const style = {
          "--rotate": `${rotate}deg`,
          "--drop": `${drop}px`,
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
