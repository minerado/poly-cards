import type { CardInstance, GameState } from "./types";

/** Splits `count` cards off the top of a deck: [drawn, remaining]. */
export function draw(deck: CardInstance[], count: number): [CardInstance[], CardInstance[]] {
  const drawn = deck.slice(0, count);
  const rest = deck.slice(count);
  return [drawn, rest];
}

export function withLog(state: GameState, message: string): GameState {
  return { ...state, log: [...state.log, message] };
}
