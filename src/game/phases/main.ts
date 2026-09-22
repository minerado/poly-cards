import { definitionOf, resourceGeneratedBy } from "../components/queries";
import { withLog } from "../helpers";
import type { GameState, PlayerState } from "../types";
import type { PhaseDef } from "./types";

function foodDeficit(state: GameState) {
  const population = state.player.lane.length;
  const food = state.player.resources.Food;
  return { population, deficit: Math.max(0, population - food) };
}

export const mainPhase: PhaseDef = {
  name: "main",
  label: "Main",
  // No autoAdvance — this is where the player actually acts. Just a
  // transient announcement that doesn't gate anything.
  narrator: { message: "Your Turn", delayMs: 1100 },
  nextLabel: (state, ctx) => {
    if (!ctx.isEnabled("upkeep")) return `To ${ctx.labelOf(ctx.nextAfter("main"))}`;
    const { deficit } = foodDeficit(state);
    return deficit > 0 ? "To Upkeep" : `To ${ctx.labelOf(ctx.nextAfter("upkeep"))}`;
  },
  reduce(state, action, ctx) {
    switch (action.type) {
      case "PLACE_WORKER": {
        if (state.player.hasPlacedWorkerThisTurn) return undefined;
        const card = state.player.hand.find((c) => c.instanceId === action.instanceId);
        if (!card) return undefined;

        // Default rule: always the back of the line (see Rules/Deployment
        // Placement.md). A modifier can override that and let the caller
        // choose the index instead (see Rules/Placement Modifiers.md) — the
        // index is only honored when that modifier is active, so a stray
        // index on an action can't bypass the rule while it's off.
        const lane = [...state.player.lane];
        const insertAt =
          state.modifiers.freeWorkerPlacement && action.index !== undefined
            ? Math.max(0, Math.min(action.index, lane.length))
            : lane.length;
        lane.splice(insertAt, 0, card);

        const player: PlayerState = {
          ...state.player,
          hand: state.player.hand.filter((c) => c.instanceId !== action.instanceId),
          lane,
          hasPlacedWorkerThisTurn: true,
        };
        return withLog({ ...state, player }, `Placed ${definitionOf(card).name} into the lane.`);
      }

      case "TAP_WORKER": {
        const card = state.player.lane.find((c) => c.instanceId === action.instanceId);
        if (!card || card.tapped) return undefined;

        const generated = resourceGeneratedBy(card);
        if (!generated) return undefined; // this card has nothing to tap for

        const player: PlayerState = {
          ...state.player,
          lane: state.player.lane.map((c) =>
            c.instanceId === action.instanceId ? { ...c, tapped: true } : c
          ),
          resources: {
            ...state.player.resources,
            [generated.resource]: state.player.resources[generated.resource] + generated.amount,
          },
        };
        return withLog(
          { ...state, player },
          `Tapped ${definitionOf(card).name} for ${generated.amount} ${generated.resource}.`
        );
      }

      case "ADVANCE": {
        // Upkeep is entirely absent from the turn loop right now — see
        // phases/index.ts's TURN_PHASES. Nothing else needs to know that;
        // Main is the only phase that has to decide whether to route there.
        if (!ctx.isEnabled("upkeep")) {
          return withLog(
            { ...state, phase: ctx.nextAfter("main") },
            "Upkeep is disabled — skipping straight to Warfare."
          );
        }

        const { population, deficit } = foodDeficit(state);
        if (deficit === 0) {
          return withLog(
            { ...state, phase: ctx.nextAfter("upkeep") }, // skip past Upkeep, nothing owed
            population === 0
              ? "Upkeep: no population to feed."
              : `Upkeep: population fed (${population} Food consumed).`
          );
        }

        return withLog(
          { ...state, phase: "upkeep", pendingSacrifices: deficit },
          `Upkeep: short ${deficit} Food. Sacrifice ${deficit} Worker(s) to feed the population.`
        );
      }

      default:
        return undefined;
    }
  },
};
