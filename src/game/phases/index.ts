import { setupGame } from "../setup";
import type { Action, GameState, Phase } from "../types";
import { coinTossPhase } from "./coinToss";
import { drawPhase } from "./draw";
import { endPhase } from "./end";
import { mainPhase } from "./main";
import { mulliganPhase } from "./mulligan";
import type { PhaseCtx, PhaseDef } from "./types";
import { untapPhase } from "./untap";
// import { upkeepPhase } from "./upkeep"; // <- disabled, see TURN_PHASES below
import { warfarePhase } from "./warfare";

/**
 * The turn loop, in order. Pregame phases (coin toss, mulligan — see
 * PREGAME_PHASES below) are handled separately: the last one hands off to
 * whichever phase is first here, but neither participates in "next in
 * sequence" itself.
 *
 * To disable a phase during design/testing, comment out its line below
 * (and its import above — TS flags an unused one). Nothing else needs to
 * change: every other phase's "what comes next" is derived from this list
 * at runtime, not hardcoded by name, so the turn loop, the phase-validity
 * checks, and every "Next" button's label all stay correct automatically.
 */
export const TURN_PHASES: PhaseDef[] = [
  untapPhase,
  drawPhase,
  mainPhase,
  // upkeepPhase, // <- disabled while this mechanic is still being designed
  warfarePhase,
  endPhase,
];

/** In order: coin toss reveals who goes first, then mulligan. Neither is
 *  part of the repeating turn loop — see TURN_PHASES. */
const PREGAME_PHASES: PhaseDef[] = [coinTossPhase, mulliganPhase];

const ALL_PHASES: PhaseDef[] = [...PREGAME_PHASES, ...TURN_PHASES];

function buildPhaseCtx(turnPhases: PhaseDef[], allPhases: PhaseDef[]): PhaseCtx {
  const order = turnPhases.map((p) => p.name);
  const byName = new Map(allPhases.map((p) => [p.name, p]));

  return {
    isEnabled: (name) => order.includes(name),
    nextAfter: (name) => {
      const idx = order.indexOf(name);
      if (idx === -1) {
        throw new Error(`nextAfter: "${name}" is not an active turn phase`);
      }
      return order[(idx + 1) % order.length];
    },
    labelOf: (name) => {
      const phase = byName.get(name);
      if (!phase) throw new Error(`labelOf: unknown phase "${name}"`);
      return phase.label;
    },
    firstTurnPhase: () => {
      if (order.length === 0) throw new Error("firstTurnPhase: no turn phases are active");
      return order[0];
    },
  };
}

export function createReducer(turnPhases: PhaseDef[]) {
  const allPhases: PhaseDef[] = [...PREGAME_PHASES, ...turnPhases];
  const byName = new Map(allPhases.map((p) => [p.name, p]));
  const ctx = buildPhaseCtx(turnPhases, allPhases);

  return function reducer(state: GameState, action: Action): GameState {
    // Keeps the difficulty the player picked at the main menu — RESTART is
    // "play again", not "back to menu and reconfigure" (that's a separate
    // exit path — see GameBoard's onExitToMenu).
    if (action.type === "RESTART") return setupGame(state.difficulty);
    if (state.gameOver) return state;

    const phase = byName.get(state.phase);
    if (!phase) return state;

    const next = phase.reduce(state, action, ctx) ?? state;

    // Generic phase-entry hook (see PhaseDef.onEnter) — checked here, once,
    // rather than every phase's own reduce needing to know about every
    // other phase's entry behavior.
    if (next.phase !== state.phase) {
      const entered = byName.get(next.phase);
      if (entered?.onEnter) return entered.onEnter(next);
    }

    return next;
  };
}

/** The reducer the app actually ships with, built from TURN_PHASES above. */
export const gameReducer = createReducer(TURN_PHASES);

/**
 * The same context object `gameReducer` uses internally, exposed so the UI
 * can resolve a phase's dynamic `nextLabel` (e.g. Main's "To Upkeep" vs
 * "To Warfare") without duplicating the phase list or its ordering.
 */
export const phaseCtx: PhaseCtx = buildPhaseCtx(TURN_PHASES, ALL_PHASES);

/** Looks up a phase's own definition (for its label, nextLabel, etc.) by name. */
export function findPhaseDef(name: Phase): PhaseDef | undefined {
  return ALL_PHASES.find((p) => p.name === name);
}
