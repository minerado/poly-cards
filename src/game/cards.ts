import type { CardInstance } from "./types";

let nextInstanceId = 0;

function createInstance(defId: string): CardInstance {
  nextInstanceId += 1;
  return { instanceId: `${defId}-${nextInstanceId}`, defId, tapped: false };
}

/** Starter deck: 10 Farmers, 10 Builders. */
export function buildStarterDeck(): CardInstance[] {
  const cards: CardInstance[] = [];
  for (let i = 0; i < 10; i += 1) cards.push(createInstance("farmer"));
  for (let i = 0; i < 10; i += 1) cards.push(createInstance("builder"));
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
