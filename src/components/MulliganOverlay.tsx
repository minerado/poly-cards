import { useEffect, useState } from "react";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";

interface MulliganOverlayProps {
  hand: CardInstance[];
  onConfirm: () => void;
  onFinish: () => void;
}

type Stage = "dealing" | "satisfied" | "discarding";

const DEAL_STAGGER_MS = 70;
const DEAL_ANIM_MS = 500;
const DISCARD_MS = 420;

export function MulliganOverlay({ hand, onConfirm, onFinish }: MulliganOverlayProps) {
  const [stage, setStage] = useState<Stage>("dealing");
  const [discardingIds, setDiscardingIds] = useState<string[]>([]);

  useEffect(() => {
    if (stage !== "dealing") return;
    // Must outlast the last card's own delay + animation, or its entrance
    // gets cut off mid-flight when the "--deal" class is removed, and the
    // base class's transition snaps it the rest of the way — a jarring
    // second motion layered on top of the keyframe animation. Re-fires for
    // every fresh (smaller) hand dealt after a mulligan, not just the first.
    const dealMs = Math.max(0, hand.length - 1) * DEAL_STAGGER_MS + DEAL_ANIM_MS;
    const t = setTimeout(() => setStage("satisfied"), dealMs);
    return () => clearTimeout(t);
    // hand.length is stable for the whole "dealing" stage (it only changes
    // once a mulligan round lands, which re-triggers this same stage), so
    // it's intentionally left out of the deps.
  }, [stage]);

  function handleMulligan() {
    if (hand.length <= 1) return; // guarded in the UI too, not just the engine
    setDiscardingIds(hand.map((c) => c.instanceId));
    setStage("discarding");

    setTimeout(() => {
      onConfirm(); // shuffles the whole hand back, draws one fewer
      // Discarded cards go back into the deck and can be redrawn in a later
      // round with the same instanceId — if this list weren't cleared, a
      // redrawn card would still match it and render invisible (stuck with
      // "--discard"'s opacity: 0) despite also getting dealt back in.
      setDiscardingIds([]);
      setStage("dealing"); // re-deal the new (smaller) hand with the same animation
    }, DISCARD_MS);
  }

  const canMulligan = hand.length > 1;

  const message =
    stage === "dealing"
      ? "Dealing your hand…"
      : stage === "satisfied"
      ? "Are you satisfied with this hand?"
      : "Shuffling your hand back into the deck…";

  return (
    <div className="mulligan-overlay">
      <div className="mulligan-overlay__message">{message}</div>

      <div className="mulligan-overlay__hand">
        {hand.map((card, index) => {
          const classes = [
            "mulligan-card",
            stage === "dealing" ? "mulligan-card--deal" : "",
            discardingIds.includes(card.instanceId) ? "mulligan-card--discard" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={card.instanceId}
              className={classes}
              style={{ animationDelay: `${index * DEAL_STAGGER_MS}ms` }}
            >
              <CardView card={card} variant="mulligan" />
            </div>
          );
        })}
      </div>

      {/* Always mounted (not conditionally rendered) so its layout space is
          reserved from the very first frame — otherwise the column
          re-centers and the just-dealt hand snaps upward the moment this
          becomes part of the flex flow. */}
      <div className="mulligan-overlay__footer">
        <div
          className={`mulligan-overlay__group ${
            stage !== "satisfied" ? "mulligan-overlay__group--hidden" : ""
          }`}
        >
          <button className="mulligan-overlay__confirm" onClick={onFinish}>
            Keep This Hand
          </button>
          <button
            className="mulligan-overlay__confirm mulligan-overlay__confirm--secondary"
            onClick={handleMulligan}
            disabled={!canMulligan}
          >
            Mulligan
          </button>
        </div>
      </div>
    </div>
  );
}
