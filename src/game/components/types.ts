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
  general: string; // "Worker" today; "Human" etc. later
  specific: string[]; // e.g. ["Farmer"] — an array since specific types can stack
}

export interface Cost {
  resource: ResourceType;
  amount: number;
}

export interface ComponentBag {
  resourceGenerator?: ResourceGenerator;
  workerTier?: WorkerTier;
  cardTypes?: CardTypes;
  /** Marks a card as the Draft ability itself (see Rules/Draft Ability.md):
   *  a Worker can't draft itself — this is what actually performs the
   *  draft, targeting a separate untapped Worker when played from hand. */
  draftAbility?: true;
  /** What it costs to play this card from hand — checked and paid from
   *  the acting side's resources at the moment the card's effect
   *  resolves (see Rules/Draft Ability.md). Generic, not Draft-specific:
   *  any future card played from hand can carry this same component. */
  cost?: Cost;
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
