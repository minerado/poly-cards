import { activePlayerState, withActivePlayerState, withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const untapPhase: PhaseDef = {
  name: "untap",
  label: "Untap",
  // No decision here, for either side — announce it and untap automatically.
  narrator: { message: "Untap Phase", delayMs: 400, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;

    // Untaps whichever side's turn is *starting* — the side End just
    // handed off to (see end.ts), not the side that just finished. Tapped
    // cards need to stay tapped through the other side's entire
    // intervening turn (that's the whole point of tapping something —
    // Rules/Tapping.md), so this can't run as part of the previous
    // side's own End; it has to be the first thing that happens once
    // it's actually this side's turn again.
    const active = activePlayerState(state);
    const updated: PlayerState = { ...active, lane: active.lane.map((c) => ({ ...c, tapped: false })) };

    return withLog(
      { ...withActivePlayerState(state, updated), phase: ctx.nextAfter("untap") },
      `${state.activeSide === "player" ? "Your" : "Opponent's"} lane untaps.`
    );
  },
};
