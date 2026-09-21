import { setupGame } from "../setup";
import type { Action, GameState, Phase } from "../types";
import { drawPhase } from "./draw";
import { endPhase } from "./end";
import { mainPhase } from "./main";
import { mulliganPhase } from "./mulligan";
import type { PhaseCtx, PhaseDef } from "./types";
// import { upkeepPhase } from "./upkeep"; // <- disabled, see TURN_PHASES below
import { warfarePhase } from "./warfare";

/**
 * The turn loop, in order. Mulligan is pregame and handled separately — it
 * hands off to whichever phase is first here, but doesn't participate in
 * "next in sequence" itself.
 *
 * To disable a phase during design/testing, comment out its line below
 * (and its import above — TS flags an unused one). Nothing else needs to
 * change: every other phase's "what comes next" is derived from this list
 * at runtime, not hardcoded by name, so the turn loop, the phase-validity
 * checks, and every "Next" button's label all stay correct automatically.
 */
export const TURN_PHASES: PhaseDef[] = [
  drawPhase,
  mainPhase,
  // upkeepPhase, // <- disabled while this mechanic is still being designed
  warfarePhase,
  endPhase,
];

const ALL_PHASES: PhaseDef[] = [mulliganPhase, ...TURN_PHASES];

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
  const allPhases: PhaseDef[] = [mulliganPhase, ...turnPhases];
  const byName = new Map(allPhases.map((p) => [p.name, p]));
  const ctx = buildPhaseCtx(turnPhases, allPhases);

  return function reducer(state: GameState, action: Action): GameState {
    if (action.type === "RESTART") return setupGame();
    if (state.gameOver) return state;

    const phase = byName.get(state.phase);
    if (!phase) return state;

    return phase.reduce(state, action, ctx) ?? state;
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
