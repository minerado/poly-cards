import type { CardInstance, ResourceType } from "../types";
import { CARD_REGISTRY } from "./registry";
import type { CardDefinition, ResourceAmounts, ResourceGenerator } from "./types";

export function definitionOf(card: CardInstance): CardDefinition {
  return CARD_REGISTRY[card.defId];
}

/** Sum of every attached card's resourceGeneratorPenalty entry for one
 *  resource — a card can carry several attachments, each contributing
 *  independently, so this always sums rather than taking just the first. */
function totalGenerationPenalty(card: CardInstance, resource: ResourceType): number {
  return card.attachments.reduce((sum, attachment) => {
    const entry = definitionOf(attachment).components.resourceGeneratorPenalty?.find(
      (e) => e.resource === resource
    );
    return sum + (entry?.amount ?? 0);
  }, 0);
}

/**
 * The "tap for resource" system. Reads the ResourceGenerator component if
 * the card has one — never asks which card this is, so a new card type
 * with the same component works here with no change. Nets out any
 * attachment's resourceGeneratorPenalty (see Rules/Draft Ability.md) and
 * floors at 0: a fully-offset Worker has nothing left to tap for, exactly
 * like a card with no resourceGenerator component at all — callers (see
 * phases/main.ts's TAP_WORKER) don't need to know why, just that there's
 * nothing here.
 */
export function resourceGeneratedBy(card: CardInstance): ResourceGenerator | undefined {
  const base = definitionOf(card).components.resourceGenerator;
  if (!base) return undefined;
  const amount = base.amount - totalGenerationPenalty(card, base.resource);
  return amount > 0 ? { resource: base.resource, amount } : undefined;
}

/** Does this card currently carry Warfare (see Rules/Draft Ability.md)? A
 *  lasting property of whatever's attached to it (see
 *  CardInstance.attachments and ComponentBag.grantsWarfare) — not a flag
 *  stored on the card itself, so it's automatically correct for however
 *  many attachments a card ends up with, present or future. */
export function hasWarfare(card: CardInstance): boolean {
  return card.attachments.some((attachment) => !!definitionOf(attachment).components.grantsWarfare);
}

/** "General — Specific, Specific" for a card's type line, if it has one. */
export function typeLineOf(def: CardDefinition): string | undefined {
  const types = def.components.cardTypes;
  if (!types) return undefined;
  return types.specific.length > 0
    ? `${types.general} — ${types.specific.join(", ")}`
    : types.general;
}

/** Can this card be played from hand at a target lane card, attaching to
 *  it (see Concepts/Orders.md and Rules/Draft Ability.md), rather than
 *  going into the lane itself or resolving once to the graveyard? A
 *  Worker can't draft itself — only a card with this component, played at
 *  a *different* target, can attach. */
export function isAttachable(card: CardInstance): boolean {
  return !!definitionOf(card).components.attachable;
}

/** Can this card go into the lane via PLACE_WORKER? Component presence
 *  (workerTier), not a `cardTypes.general === "Worker"` string match — the
 *  same "ask what it has, not what it is" idiom as isAttachable above. An
 *  Order card like Draft has no workerTier and is never a valid
 *  PLACE_WORKER target, however it got there (a stray UI path, an AI
 *  heuristic grabbing the wrong hand slot). */
export function isWorker(card: CardInstance): boolean {
  return !!definitionOf(card).components.workerTier;
}

/** What this card costs to play from hand, if anything — one entry per
 *  resource required. */
export function costOf(card: CardInstance): ResourceAmounts | undefined {
  return definitionOf(card).components.cost;
}

/** Whether `resources` currently covers every entry of `cost` at once —
 *  all-or-nothing, same as a single-resource cost always was. No cost at
 *  all is trivially affordable. */
export function canAfford(
  resources: Record<ResourceType, number>,
  cost: ResourceAmounts | undefined
): boolean {
  if (!cost) return true;
  return cost.every((entry) => resources[entry.resource] >= entry.amount);
}

/** Pays every entry of `cost` out of `resources` at once — the caller is
 *  responsible for having checked canAfford first, same as the old
 *  single-resource callers always were. */
export function payCost(
  resources: Record<ResourceType, number>,
  cost: ResourceAmounts | undefined
): Record<ResourceType, number> {
  if (!cost) return resources;
  const updated = { ...resources };
  for (const entry of cost) updated[entry.resource] -= entry.amount;
  return updated;
}
