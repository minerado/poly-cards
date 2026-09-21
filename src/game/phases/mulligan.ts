import { shuffle } from "../cards";
import { draw, withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const mulliganPhase: PhaseDef = {
  name: "mulligan",
  label: "Mulligan",
  // No nextLabel — the mulligan overlay has its own "Keep This Hand" /
  // "Redraw" buttons, not the generic phase-btn.
  reduce(state, action, ctx) {
    switch (action.type) {
      case "CONFIRM_MULLIGAN": {
        // Can't mulligan a 1-card hand — nothing left to shrink to.
        if (state.player.hand.length <= 1) return undefined;

        const discarded = state.player.hand;
        const keepCount = discarded.length - 1;
        const [hand, deck] = draw(shuffle([...state.player.deck, ...discarded]), keepCount);
        const player: PlayerState = { ...state.player, deck, hand };

        // Stays in "mulligan" — the player is asked again whether they're
        // satisfied, and can keep mulliganing (one fewer card each time)
        // down to a 1-card hand.
        return withLog(
          { ...state, player },
          `Mulligan: shuffled ${discarded.length} cards back into the deck, drew a new hand of ${hand.length}.`
        );
      }

      case "FINISH_MULLIGAN": {
        const first = ctx.firstTurnPhase();
        return withLog(
          { ...state, phase: first },
          `Mulligan: kept this hand. Turn 1 — ${ctx.labelOf(first)} phase.`
        );
      }

      default:
        return undefined;
    }
  },
};
