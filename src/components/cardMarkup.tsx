import type { ComponentType, ReactNode } from "react";
import { FoodBadge, LaborBadge } from "./ResourceBadges";
import { TurnBadge } from "./TurnBadge";

/**
 * Authoring a card's rules text is just writing markup — e.g.
 * "[turn]: Generate 1 [food-badge]" — rather than a component deciding on
 * its own, from unrelated card data, which badges belong in the text.
 * Add a new badge to a card's vocabulary by adding a token here; nothing
 * else needs to change.
 */
const BADGE_TOKENS: Record<string, ComponentType> = {
  "[turn]": TurnBadge,
  "[food-badge]": FoodBadge,
  "[labor-badge]": LaborBadge,
};

const TOKEN_PATTERN = new RegExp(
  `(${Object.keys(BADGE_TOKENS)
    .map((token) => token.replace(/[[\]]/g, "\\$&"))
    .join("|")})`,
  "g",
);

/** Expands any `[…]` badge markers in card text into their inline badges. */
export function withBadges(text: string): ReactNode[] {
  return text.split(TOKEN_PATTERN).map((part, i) => {
    const Badge = BADGE_TOKENS[part];
    return Badge ? <Badge key={i} /> : part;
  });
}
