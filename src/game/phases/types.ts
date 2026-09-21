import type { Action, GameState, Phase } from "../types";

/**
 * What a phase can ask about the active configuration, without needing to
 * know it by hardcoding other phases' names. Backed by whatever phase list
 * the reducer was built with — see phases/index.ts.
 */
export interface PhaseCtx {
  isEnabled(name: Phase): boolean;
  /** The phase that follows `name` in the turn loop (wraps at the end). Throws if `name` isn't active. */
  nextAfter(name: Phase): Phase;
  /** The display label of any known phase, including pregame ones like mulligan. */
  labelOf(name: Phase): string;
  /** Where the turn loop actually begins — what pregame phases hand off to, instead of assuming "draw". */
  firstTurnPhase(): Phase;
}

/**
 * A phase announcing itself. If `autoAdvance` is set, GameBoard dispatches
 * ADVANCE on the phase's behalf once `delayMs` elapses — no player input
 * needed, for phases with no real decision to make (Draw, Warfare, End).
 * If unset, it's just a transient announcement (Main's "Your Turn") that
 * doesn't gate anything.
 */
export interface PhaseNarrator {
  message: string;
  delayMs: number;
  autoAdvance?: boolean;
}

/**
 * One phase, fully self-contained: its identity, its display label, and
 * every rule for what happens while the game is in it. Nothing outside a
 * phase's own file should need to know its internals.
 */
export interface PhaseDef {
  name: Phase;
  label: string;
  /**
   * Label for the phase's own "Next"-style button, if it has one. Phases
   * that advance through other means (the mulligan overlay's own buttons,
   * clicking lane cards to pay Upkeep, or a `narrator.autoAdvance`) omit
   * this — GameBoard renders no generic button for them.
   */
  nextLabel?: string | ((state: GameState, ctx: PhaseCtx) => string);
  /** See PhaseNarrator. Omit entirely for phases that announce nothing. */
  narrator?: PhaseNarrator;
  /**
   * Handle an action that belongs to this phase. The reducer only calls
   * this for the phase the game is currently in, so there's no need to
   * re-check `state.phase` here. Return `undefined` to mean "this phase
   * doesn't handle this action" (a no-op).
   */
  reduce(state: GameState, action: Action, ctx: PhaseCtx): GameState | undefined;
}
