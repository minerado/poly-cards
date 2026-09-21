import { withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const endPhase: PhaseDef = {
  name: "end",
  label: "End",
  // Just cleanup — announce and pass through automatically.
  narrator: { message: "End Phase", delayMs: 450, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;

    const player: PlayerState = {
      ...state.player,
      lane: state.player.lane.map((c) => ({ ...c, tapped: false })),
      resources: { Food: 0, Labor: 0 },
      hasPlacedWorkerThisTurn: false,
    };
    const turn = state.turn + 1;
    const next = ctx.nextAfter("end");
    return withLog(
      { ...state, player, turn, phase: next },
      `Turn ${turn} — ${ctx.labelOf(next)} phase.`
    );
  },
};
