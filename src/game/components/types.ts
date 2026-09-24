import type { ResourceType } from "../types";

/**
 * A component is one small, single-purpose slice of data describing
 * something a card can do or be. A card's definition carries an
 * open-ended bag of these instead of a fixed shape — adding a new kind of
 * card is authoring data (a new registry entry with whatever components it
 * needs), never touching a switch statement or extending a union type.
 * See game/components/registry.ts for the actual card data, and
 * game/components/queries.ts for the small pure functions ("systems")
 * that read components back out.
 */

export interface ResourceGenerator {
  resource: ResourceType;
  amount: number;
}

export interface WorkerTier {
  tier: "Basic" | "Specialized";
}

/** Mirrors the design docs' "Dimensions" concept: general type + stackable specific types. */
export interface CardTypes {
  general: string; // "Worker" and "Order" today (see Concepts/Orders.md); "Human" etc. later
  specific: string[]; // e.g. ["Farmer"] — an array since specific types can stack
}

export interface Cost {
  resource: ResourceType;
  amount: number;
}

/** One entry per resource involved — e.g. Draft's cost touches both Food
 *  and Labor, so it carries two entries. Reused for two different things
 *  (see ComponentBag below): as a *cost*, every entry has to be
 *  affordable at once (all-or-nothing — see components/queries.ts's
 *  canAfford/payCost); as a *generation penalty*, every entry reduces
 *  whichever of the host's own resources it names. Same shape either way
 *  — "amount of resource X", read differently by whichever system asks
 *  for it. */
export type ResourceAmounts = Cost[];

export interface ComponentBag {
  resourceGenerator?: ResourceGenerator;
  workerTier?: WorkerTier;
  cardTypes?: CardTypes;
  /** Marks a card as attachable (see Concepts/Orders.md and Rules/Draft
   *  Ability.md): playing it from hand targets an existing lane card and
   *  joins that card's `attachments` instead of resolving once and going
   *  to the graveyard. Generic, not Draft-specific — any future Order
   *  card that works the same way (target, attach, stay) carries this
   *  same component; what it actually *does* once attached lives in its
   *  own components below (grantsWarfare, resourceGeneratorPenalty, …),
   *  read by components/queries.ts rather than special-cased per card. */
  attachable?: true;
  /** While attached (see CardInstance.attachments), grants the host 1
   *  Warfare — boolean, not a count, per Concepts/Workers.md's "no
   *  per-card counters" principle. See components/queries.ts's
   *  hasWarfare. */
  grantsWarfare?: true;
  /** While attached, reduces the host's own resourceGenerator output by
   *  this much per matching resource (floors at 0 — see
   *  components/queries.ts's resourceGeneratedBy). A host that doesn't
   *  generate a listed resource at all is simply unaffected by that
   *  entry. */
  resourceGeneratorPenalty?: ResourceAmounts;
  /** What it costs to play this card from hand — checked and paid from
   *  the acting side's resources at the moment the card's effect
   *  resolves (see Rules/Draft Ability.md). Generic, not Draft-specific:
   *  any future card played from hand can carry this same component. */
  cost?: ResourceAmounts;
  // Add new components here as new mechanics are designed. Each addition
  // is a new optional field — existing components and the cards that use
  // them never need to change.
}

export interface CardDefinition {
  id: string;
  name: string;
  image: string;
  /** Flavor/rules text. Can run long — never rendered on the lane's small card, only in its hover preview. */
  description?: string;
  /** Overrides the text box's default font size (px) for cards whose description needs to run smaller to fit. */
  descriptionFontSize?: number;
  components: ComponentBag;
}
