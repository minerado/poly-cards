import { Hammer, Wheat } from "lucide-react";
import { RoundBadge } from "./RoundBadge";

/**
 * Resource glyphs — one per ResourceType, styled like Magic's mana symbols:
 * same round badge shape as every other RoundBadge, but each resource gets
 * its own color identity so Food and Labor read apart at a glance, in card
 * text or the HUD.
 */

export function FoodBadge() {
  return (
    <RoundBadge className="round-badge--food">
      <Wheat size="0.65em" strokeWidth={3.5} aria-hidden="true" />
    </RoundBadge>
  );
}

export function LaborBadge() {
  return (
    <RoundBadge className="round-badge--labor">
      <Hammer size="0.65em" strokeWidth={3.5} aria-hidden="true" />
    </RoundBadge>
  );
}
