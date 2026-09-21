import { CornerRightDown } from "lucide-react";
import { RoundBadge } from "./RoundBadge";

/**
 * The "happens each turn" glyph — lucide's CornerRightDown in the base
 * RoundBadge, sized in em so it always matches whatever text it sits next
 * to. Used anywhere an ability is marked as a per-turn effect (card
 * descriptions today; HUD/log entries or tooltips are fair game later).
 */
export function TurnBadge() {
  return (
    <RoundBadge>
      <CornerRightDown size="0.65em" strokeWidth={3.5} aria-hidden="true" />
    </RoundBadge>
  );
}
