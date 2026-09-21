import type { CardDefinition, CardInstance, WorkerKind } from "./types";

export const CARD_DEFINITIONS: Record<WorkerKind, CardDefinition> = {
  Farmer: { kind: "Farmer", generates: "Food", amount: 1, image: "/cards/farmer.png" },
  Builder: { kind: "Builder", generates: "Labor", amount: 1, image: "/cards/builder.png" },
};

let nextInstanceId = 0;

function createInstance(kind: WorkerKind): CardInstance {
  nextInstanceId += 1;
  return { instanceId: `${kind}-${nextInstanceId}`, kind, tapped: false };
}

/** Starter deck: 10 Farmers, 10 Builders. */
export function buildStarterDeck(): CardInstance[] {
  const cards: CardInstance[] = [];
  for (let i = 0; i < 10; i += 1) cards.push(createInstance("Farmer"));
  for (let i = 0; i < 10; i += 1) cards.push(createInstance("Builder"));
  return shuffle(cards);
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
