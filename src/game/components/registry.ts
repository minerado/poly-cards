import type { CardDefinition } from "./types";

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/**
 * The card pool. Adding a new card is one more entry here — a data
 * declaration, not a code change. Nothing outside this file and
 * queries.ts should ever need to know a card's id by name; game logic
 * asks "does this card have component X", not "is this a Farmer".
 */
export const CARD_REGISTRY: Record<string, CardDefinition> = {
  farmer: {
    id: "farmer",
    name: "Farmer",
    image: asset("cards/farmer.png"),
    description: "[turn]: Generate [food-badge]",
    components: {
      resourceGenerator: { resource: "Food", amount: 1 },
      workerTier: { tier: "Basic" },
      cardTypes: { general: "Worker", specific: ["Farmer"] },
    },
  },
  builder: {
    id: "builder",
    name: "Builder",
    image: asset("cards/builder.png"),
    description: "[turn]: Generate [labor-badge]",
    components: {
      resourceGenerator: { resource: "Labor", amount: 1 },
      workerTier: { tier: "Basic" },
      cardTypes: { general: "Worker", specific: ["Builder"] },
    },
  },
  draft: {
    id: "draft",
    name: "Draft",
    // No dedicated art yet — reusing the card back as a placeholder face
    // until this gets real illustration.
    image: asset("cards/card-back.png"),
    description: "Cost: 1 [labor-badge]\nFlip a target untapped Worker into Warfare.",
    components: {
      cardTypes: { general: "Action", specific: [] },
      draftAbility: true,
      cost: { resource: "Labor", amount: 1 },
    },
  },
};
