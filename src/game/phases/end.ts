import { activePlayerState, withActivePlayerState, withLog } from "../helpers";
import type { PlayerState, Side } from "../types";
import type { PhaseDef } from "./types";

export const endPhase: PhaseDef = {
  name: "end",
  label: "End",
  // Just cleanup — announce and pass through automatically, for either side.
  narrator: { message: "End Phase", delayMs: 450, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;

    const active = activePlayerState(state);
    const updated: PlayerState = {
      ...active,
      lane: active.lane.map((c) => ({ ...c, tapped: false })),
      resources: { Food: 0, Labor: 0 },
      hasPlacedWorkerThisTurn: false,
      hasDraftedThisTurn: false,
    };
    const stateAfterReset = withActivePlayerState(state, updated);

    // Turns alternate: whoever just finished hands off to the other side.
    // Only once the side that DIDN'T go first also finishes does a new
    // round actually begin (turn increments, control returns to firstSide)
    // — see types.ts's firstSide/activeSide.
    const isLastSideOfRound = state.activeSide !== state.firstSide;
    const nextActiveSide: Side = isLastSideOfRound
      ? state.firstSide
      : state.activeSide === "player"
      ? "opponent"
      : "player";
    const turn = isLastSideOfRound ? state.turn + 1 : state.turn;
    const next = ctx.nextAfter("end");

    return withLog(
      { ...stateAfterReset, activeSide: nextActiveSide, turn, phase: next },
      `${nextActiveSide === "player" ? "Your" : "Opponent's"} turn (Turn ${turn}) — Draw phase.`
    );
  },
};
