import { Hammer, Swords, Wheat } from "lucide-react";
import { RoundBadge } from "./RoundBadge";
import type { ResourceType } from "../game/types";

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

/** Picks the right badge for a ResourceType — for spots (like a token's
 *  resource strip) that only know the resource, not which specific glyph. */
export function ResourceBadge({ resource }: { resource: ResourceType }) {
  return resource === "Food" ? <FoodBadge /> : <LaborBadge />;
}

/** The Warfare glyph — used in card rules text via cardMarkup.tsx's
 *  `[warfare-badge]` token (see the Draft card's own description). Not
 *  used on a card's own face: a drafted Worker's face never changes (see
 *  CardView.tsx) — the only on-board sign of a Draft attachment is the
 *  card peeking out behind its host. */
export function WarfareBadge() {
  return (
    <RoundBadge className="round-badge--warfare">
      <Swords size="0.65em" strokeWidth={3.5} aria-hidden="true" />
    </RoundBadge>
  );
}
