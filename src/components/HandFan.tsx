import type { CSSProperties } from "react";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";
import { fanSlot } from "./fanLayout";
import { useHandTuning } from "../dev/handTuning";

interface HandFanProps {
  cards: CardInstance[];
  onCardClick?: (instanceId: string) => void;
  actionLabel?: string;
  /** Renders every card as a back, and disables hover/click entirely (the opponent's hand). */
  faceDown?: boolean;
}

export function HandFan({ cards, onCardClick, actionLabel, faceDown }: HandFanProps) {
  const { readableCardWidth, handCardWidth, maxRotation, rotationStep, riseFactor, overlap, peek } =
    useHandTuning();
  const containerStyle = {
    // Two independent, predefined sizes — handCardWidth isn't a fraction of
    // readableCardWidth, it's its own fixed value. The ratio below is only
    // how the hover transform animates from one to the other; it isn't a
    // relationship between the two sizes themselves.
    "--hand-card-width": `${handCardWidth}px`,
    "--hand-hover-scale": readableCardWidth / handCardWidth,
    "--hand-overlap": `${overlap}px`,
    "--hand-peek": `${peek}px`,
  } as CSSProperties;

  return (
    <div className={`hand-fan ${faceDown ? "hand-fan--static" : ""}`} style={containerStyle}>
      {cards.map((card, index) => {
        // Edge cards sit on the tray's baseline; the center card rises above
        // it, forming a dome. Nothing ever moves below baseline, so the fan
        // can't clip past the (viewport-flush) bottom of the tray.
        const { rotate, drop } = fanSlot(index, cards.length, { riseFactor, maxRotation, rotationStep });
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
