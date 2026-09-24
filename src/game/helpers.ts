import type { CardInstance, GameState, PlayerState } from "./types";

/** Splits `count` cards off the top of a deck: [drawn, remaining]. */
export function draw(deck: CardInstance[], count: number): [CardInstance[], CardInstance[]] {
  const drawn = deck.slice(0, count);
  const rest = deck.slice(count);
  return [drawn, rest];
}

export function withLog(state: GameState, message: string): GameState {
  return { ...state, log: [...state.log, message] };
}

/**
 * The PlayerState of whichever side is currently taking its turn. Every
 * phase that acts on "the current player" (Draw, Main, Upkeep, End) reads
 * and writes through this pair instead of hardcoding `state.player`, so
 * the same logic works for both sides without a per-phase branch — see
 * types.ts's `activeSide`.
 */
export function activePlayerState(state: GameState): PlayerState {
  return state[state.activeSide];
}

export function withActivePlayerState(state: GameState, updated: PlayerState): GameState {
  return { ...state, [state.activeSide]: updated };
}
