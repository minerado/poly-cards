import { withLog } from "../helpers";
import type { PhaseDef } from "./types";

export const warfarePhase: PhaseDef = {
  name: "warfare",
  label: "Warfare",
  // No opponent modeled yet, so nothing to decide — announce and pass through.
  narrator: { message: "Warfare Phase", delayMs: 550, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;
    // Stub — no opponent modeled yet in the single-player prototype.
    return withLog(
      { ...state, phase: ctx.nextAfter("warfare") },
      "Warfare: no conflicts yet."
    );
  },
};
