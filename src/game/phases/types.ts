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
 * needed, for phases with no real decision to make (Draw, Warfare, End —
 * and Main too, on the opponent's turn, since there's no player decision
 * to wait for there either). If unset, it's just a transient announcement
 * (the player's own Main, "Your Turn") that doesn't gate anything.
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
   * Label for the phase's own "Next"-style button, if it has one right
   * now. Phases that never have one (the mulligan overlay's own buttons,
   * clicking lane cards to pay Upkeep, a `narrator.autoAdvance`) omit
   * this field entirely. A phase that only SOMETIMES has one (Main, only
   * on the player's own turn) uses the function form and returns
   * `undefined` for "no button right now" — GameBoard renders no generic
   * button whenever the resolved label is falsy, whichever reason.
   */
  nextLabel?: string | ((state: GameState, ctx: PhaseCtx) => string | undefined);
  /**
   * See PhaseNarrator. Omit for phases that never announce anything, or
   * use the function form when what's announced depends on state (e.g.
   * Main's "Your Turn" vs "Opponent's Turn" — see activeSide).
   */
  narrator?: PhaseNarrator | ((state: GameState, ctx: PhaseCtx) => PhaseNarrator | undefined);
  /**
   * Handle an action that belongs to this phase. The reducer only calls
   * this for the phase the game is currently in, so there's no need to
   * re-check `state.phase` here. Return `undefined` to mean "this phase
   * doesn't handle this action" (a no-op).
   */
  reduce(state: GameState, action: Action, ctx: PhaseCtx): GameState | undefined;
  /**
   * Runs once, automatically, the instant `state.phase` becomes this
   * phase — regardless of which action caused that transition. For
   * reactions that aren't really "handling an action" (nothing chose to
   * enter Main, Draw's own ADVANCE just happened to land there), but
   * still need to happen unconditionally on arrival — e.g. the opponent's
   * whole Main-phase turn (see game/ai.ts). Optional; most phases don't
   * need one.
   */
  onEnter?(state: GameState): GameState;
}
