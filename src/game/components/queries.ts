import type { CardInstance } from "../types";
import { CARD_REGISTRY } from "./registry";
import type { CardDefinition, ResourceGenerator } from "./types";

export function definitionOf(card: CardInstance): CardDefinition {
  return CARD_REGISTRY[card.defId];
}

/**
 * The "tap for resource" system. Reads the ResourceGenerator component if
 * the card has one — never asks which card this is, so a new card type
 * with the same component works here with no change.
 */
export function resourceGeneratedBy(card: CardInstance): ResourceGenerator | undefined {
  return definitionOf(card).components.resourceGenerator;
}

/** "General — Specific, Specific" for a card's type line, if it has one. */
export function typeLineOf(def: CardDefinition): string | undefined {
  const types = def.components.cardTypes;
  if (!types) return undefined;
  return types.specific.length > 0
    ? `${types.general} — ${types.specific.join(", ")}`
    : types.general;
}
