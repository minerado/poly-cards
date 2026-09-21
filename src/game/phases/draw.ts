import { definitionOf } from "../components/queries";
import { draw as drawCards, withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const drawPhase: PhaseDef = {
  name: "draw",
  label: "Draw",
  // No player decision here — announce it and draw automatically.
  narrator: { message: "Draw Phase", delayMs: 550, autoAdvance: true },
  reduce(state, action, ctx) {
    if (action.type !== "ADVANCE") return undefined;

    const [drawn, deck] = drawCards(state.player.deck, 1);
    const player: PlayerState = { ...state.player, deck, hand: [...state.player.hand, ...drawn] };
    return withLog(
      { ...state, player, phase: ctx.nextAfter("draw") },
      drawn.length > 0 ? `Drew ${definitionOf(drawn[0]).name}.` : "Deck is empty, no card drawn."
    );
  },
};
