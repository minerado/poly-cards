import type { CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";
import { fanSlot } from "./fanLayout";
import { useHandTuning } from "../dev/handTuning";

/** One card's slot in the fan — its own component (not inlined in the
 *  `.map()` below) since useDraggable is a hook and needs one call per
 *  card, not one call shared across the whole list. Dimmed rather than
 *  hidden while dragging, so its spot in the fan stays visible as a
 *  reference point (the DragOverlay in GameBoard.tsx shows the "flying"
 *  copy that follows the cursor).
 *
 *  The drag ref/listeners go on CardView's own button (via buttonProps),
 *  not this wrapping slot div — .hand-fan__slot never moves, the fan's
 *  rotate/translateY transform is applied to the card button inside it
 *  (see index.css's .card--hand). A drag lib tracking the slot would be
 *  measuring a box that stays put while the card visibly moves away from
 *  it, so its "where is this card" answer would just be wrong. */
function HandFanCard({
  card,
  style,
  faceDown,
  onClick,
  draggable,
}: {
  card: CardInstance;
  style: CSSProperties;
  faceDown?: boolean;
  onClick?: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.instanceId,
    disabled: !draggable,
  });

  return (
    <div className="hand-fan__slot" style={{ ...style, opacity: isDragging ? 0.35 : 1 }}>
      <CardView
        ref={draggable ? setNodeRef : undefined}
        card={card}
        variant="hand"
        faceDown={faceDown}
        onClick={onClick}
        buttonProps={draggable ? { ...listeners, ...attributes } : undefined}
      />
    </div>
  );
}

interface HandFanProps {
  cards: CardInstance[];
  onCardClick?: (instanceId: string) => void;
  /** Renders every card as a back, and disables hover/click entirely (the opponent's hand). */
  faceDown?: boolean;
  /** Mirrors the fan for a tray anchored to the top of its container instead
   *  of the bottom — the opponent's hand, sitting opposite the player's. */
  reversed?: boolean;
}

export function HandFan({ cards, onCardClick, faceDown, reversed }: HandFanProps) {
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
    "--hand-dir": reversed ? -1 : 1,
  } as CSSProperties;

  return (
    <div
      className={`hand-fan ${faceDown ? "hand-fan--static" : ""} ${reversed ? "hand-fan--reversed" : ""}`}
      style={containerStyle}
    >
      {cards.map((card, index) => {
        // Edge cards sit on the tray's baseline; the center card rises above
        // it, forming a dome. Nothing ever moves below baseline, so the fan
        // can't clip past the (viewport-flush) bottom of the tray. Reversed
        // negates both (see --hand-dir in the CSS), mirroring the dome to
        // droop toward the seam instead of rising toward the viewer.
        const { rotate, drop } = fanSlot(index, cards.length, { riseFactor, maxRotation, rotationStep });
        const style = {
          "--rotate": `${rotate}deg`,
          "--drop": `${drop}px`,
          zIndex: index,
        } as CSSProperties;

        const onClick = !faceDown && onCardClick ? () => onCardClick(card.instanceId) : undefined;

        return (
          <HandFanCard
            key={card.instanceId}
            card={card}
            style={style}
            faceDown={faceDown}
            onClick={onClick}
            // Draggable any time, independent of whether a drop would
            // currently do anything (e.g. wrong phase, already placed a
            // worker/drafted this turn) — dropping it somewhere invalid
            // just doesn't do anything (see GameBoard's handleDragEnd),
            // same as any other invalid click already did. Every card is
            // dragged one way or another — a Worker into the lane, a
            // Draft card onto a target already in it (see GameBoard's
            // handleDragStart) — so there's no card type this excludes.
            draggable={!faceDown}
          />
        );
      })}
    </div>
  );
}
