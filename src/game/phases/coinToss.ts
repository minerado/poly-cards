import type { PhaseDef } from "./types";

export const coinTossPhase: PhaseDef = {
  name: "coinToss",
  label: "Coin Toss",
  // No nextLabel/narrator — CoinTossOverlay plays its own flip animation
  // and reveal, then has its own confirm button, not the generic
  // phase-btn or PhaseNarrator (same pattern as MulliganOverlay).
  reduce(state, action) {
    if (action.type !== "CONFIRM_COIN_TOSS") return undefined;
    return { ...state, phase: "mulligan" };
  },
};
