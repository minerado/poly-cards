import { definitionOf } from "../components/queries";
import { activePlayerState, withActivePlayerState, withLog } from "../helpers";
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
    // Interactive-only, same as PLACE_WORKER/TAP_WORKER — there's no AI
    // sacrifice decision built yet (Upkeep is still disabled in the real
    // turn loop, see phases/index.ts), so this stays player-only for now.
    if (state.activeSide !== "player") return undefined;

    const active = activePlayerState(state);
    const card = active.lane.find((c) => c.instanceId === action.instanceId);
    if (!card) return undefined;

    const lane = active.lane.filter((c) => c.instanceId !== action.instanceId);
    const pendingSacrifices = state.pendingSacrifices - 1;
    const updated: PlayerState = { ...active, lane, graveyard: [...active.graveyard, card] };

    let next = withLog(
      { ...withActivePlayerState(state, updated), pendingSacrifices },
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
