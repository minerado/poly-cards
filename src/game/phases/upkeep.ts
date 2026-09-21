import { definitionOf } from "../components/queries";
import { withLog } from "../helpers";
import type { PlayerState } from "../types";
import type { PhaseDef } from "./types";

export const upkeepPhase: PhaseDef = {
  name: "upkeep",
  label: "Upkeep",
  // No nextLabel — there's no generic "Next" here. The player advances by
  // clicking lane cards to sacrifice (SACRIFICE_WORKER) until the deficit
  // is paid, at which point this phase moves on by itself.
  reduce(state, action, ctx) {
    if (action.type !== "SACRIFICE_WORKER" || state.pendingSacrifices <= 0) return undefined;
    const card = state.player.lane.find((c) => c.instanceId === action.instanceId);
    if (!card) return undefined;

    const lane = state.player.lane.filter((c) => c.instanceId !== action.instanceId);
    const pendingSacrifices = state.pendingSacrifices - 1;
    const player: PlayerState = {
      ...state.player,
      lane,
      graveyard: [...state.player.graveyard, card],
    };

    let next = withLog(
      { ...state, player, pendingSacrifices },
      `Sacrificed ${definitionOf(card).name}.`
    );

    if (lane.length === 0) {
      return withLog({ ...next, gameOver: true }, "Population has collapsed. Game over.");
    }
    if (pendingSacrifices === 0) {
      next = withLog({ ...next, phase: ctx.nextAfter("upkeep") }, "Upkeep satisfied.");
    }
    return next;
  },
};
