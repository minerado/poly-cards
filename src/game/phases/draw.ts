import { definitionOf } from "../components/queries";
import { activePlayerState, draw as drawCards, withActivePlayerState, withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const drawPhase: PhaseDef = {
  name: "draw",
  label: "Draw",
  // No decision here, for either side — announce it and draw automatically.
  narrator: { message: "Draw Phase", delayMs: 550, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;

    const active = activePlayerState(state);
    const [drawn, deck] = drawCards(active.deck, 1);
    const updated: PlayerState = { ...active, deck, hand: [...active.hand, ...drawn] };

    // Never names the drawn card in the log for the opponent — their hand
    // stays hidden (see HandFan's faceDown), so revealing it here would
    // leak information the board itself doesn't.
    const message =
      state.activeSide === "player"
        ? drawn.length > 0
          ? `Drew ${definitionOf(drawn[0]).name}.`
          : "Deck is empty, no card drawn."
        : drawn.length > 0
        ? "Opponent drew a card."
        : "Opponent's deck is empty, no card drawn.";

    return withLog(
      { ...withActivePlayerState(state, updated), phase: ctx.nextAfter("draw") },
      message
    );
  },
};
