import { runOpponentMainPhase } from "../ai";
import { costOf, definitionOf, hasDraftAbility, resourceGeneratedBy } from "../components/queries";
import { activePlayerState, withActivePlayerState, withLog } from "../helpers";
import type { GameState, PlayerState } from "../types";
import type { PhaseDef } from "./types";

function foodDeficit(state: GameState) {
  const active = activePlayerState(state);
  const population = active.lane.length;
  const food = active.resources.Food;
  return { population, deficit: Math.max(0, population - food) };
}

export const mainPhase: PhaseDef = {
  name: "main",
  label: "Main",
  // Only the player's own Main waits for input ("Your Turn", no
  // autoAdvance). The opponent's Main has no player decision to wait for
  // — its whole turn already resolved via onEnter below by the time this
  // shows — so it just announces and moves on by itself.
  narrator: (state) =>
    state.activeSide === "player"
      ? { message: "Your Turn", delayMs: 1100 }
      : { message: "Opponent's Turn", delayMs: 900, autoAdvance: true },
  nextLabel: (state, ctx) => {
    if (state.activeSide !== "player") return undefined; // opponent's Main auto-advances instead
    if (!ctx.isEnabled("upkeep")) return `To ${ctx.labelOf(ctx.nextAfter("main"))}`;
    const { deficit } = foodDeficit(state);
    return deficit > 0 ? "To Upkeep" : `To ${ctx.labelOf(ctx.nextAfter("upkeep"))}`;
  },
  // The opponent's whole Main-phase turn resolves the instant Main begins
  // on its side — see game/ai.ts. There's nothing yet for the player to
  // react to before it happens (no Warfare), so there's no reason to
  // stagger it behind anything else. Nothing runs here on the player's
  // own Main — that's what the interactive actions below are for.
  onEnter(state) {
    return state.activeSide === "opponent" ? runOpponentMainPhase(state) : state;
  },
  reduce(state, action, ctx) {
    switch (action.type) {
      case "PLACE_WORKER": {
        // Interactive-only: the opponent's placement happens through
        // game/ai.ts directly, not by dispatching this action, so this
        // only ever applies to the player's own turn.
        if (state.activeSide !== "player") return undefined;
        const active = activePlayerState(state);
        if (active.hasPlacedWorkerThisTurn) return undefined;
        const card = active.hand.find((c) => c.instanceId === action.instanceId);
        if (!card) return undefined;

        // Default rule: always the back of the line (see Rules/Deployment
        // Placement.md) — index 0, the deck side; the *other* end (index
        // lane.length, next to the arrow/sword and the graveyard) is the
        // front (see Rules/Front-Line Warfare.md and warfare.ts's
        // frontLine, which reads the array the same way). A modifier can
        // override the default and let the caller choose the index
        // instead (see Rules/Placement Modifiers.md) — the index is only
        // honored when that modifier is active, so a stray index on an
        // action can't bypass the rule while it's off.
        const lane = [...active.lane];
        const insertAt =
          state.modifiers.freeWorkerPlacement && action.index !== undefined
            ? Math.max(0, Math.min(action.index, lane.length))
            : 0;
        lane.splice(insertAt, 0, card);

        const updated: PlayerState = {
          ...active,
          hand: active.hand.filter((c) => c.instanceId !== action.instanceId),
          lane,
          hasPlacedWorkerThisTurn: true,
        };
        return withLog(
          withActivePlayerState(state, updated),
          `Placed ${definitionOf(card).name} into the lane.`
        );
      }

      case "TAP_WORKER": {
        if (state.activeSide !== "player") return undefined;
        const active = activePlayerState(state);
        const card = active.lane.find((c) => c.instanceId === action.instanceId);
        // A drafted card doesn't generate resources anymore (see
        // Rules/Drafting Population Risk.md) — its only tap is DRAFT's own
        // Warfare-side move action, not built yet (see Rules/Drafted
        // Warfare Turn Action.md).
        if (!card || card.tapped || card.drafted) return undefined;

        const generated = resourceGeneratedBy(card);
        if (!generated) return undefined; // this card has nothing to tap for

        const updated: PlayerState = {
          ...active,
          lane: active.lane.map((c) =>
            c.instanceId === action.instanceId ? { ...c, tapped: true } : c
          ),
          resources: {
            ...active.resources,
            [generated.resource]: active.resources[generated.resource] + generated.amount,
          },
        };
        return withLog(
          withActivePlayerState(state, updated),
          `Tapped ${definitionOf(card).name} for ${generated.amount} ${generated.resource}.`
        );
      }

      case "DRAFT": {
        // Interactive-only, same as PLACE_WORKER/TAP_WORKER — the
        // opponent's drafting happens through game/ai.ts directly.
        if (state.activeSide !== "player") return undefined;
        const active = activePlayerState(state);
        // One draft per turn — see types.ts's hasDraftedThisTurn for why
        // this specific budget was chosen (the doc leaves it open).
        if (active.hasDraftedThisTurn) return undefined;

        // The Draft ability card itself, from hand — a Worker can't draft
        // itself (Rules/Draft Ability.md), so this must be a *different*
        // card that actually carries the ability.
        const draftCard = active.hand.find((c) => c.instanceId === action.cardInstanceId);
        if (!draftCard || !hasDraftAbility(draftCard)) return undefined;
        if (action.cardInstanceId === action.targetInstanceId) return undefined;

        const target = active.lane.find((c) => c.instanceId === action.targetInstanceId);
        if (!target || target.tapped || target.drafted) return undefined;

        // Same as any other card played from hand: its cost (if it has
        // one) has to actually be affordable, checked right before the
        // effect resolves — not reserved or checked any earlier.
        const cost = costOf(draftCard);
        if (cost && active.resources[cost.resource] < cost.amount) return undefined;

        // The Draft card is consumed (played from hand, like a spell) —
        // the target is flipped and tapped in the same action (Rules/Draft
        // Ability.md), so it can't also tap for a resource or move this
        // same turn, same as any other already-tapped card.
        const updated: PlayerState = {
          ...active,
          hand: active.hand.filter((c) => c.instanceId !== draftCard.instanceId),
          graveyard: [...active.graveyard, draftCard],
          lane: active.lane.map((c) =>
            c.instanceId === target.instanceId ? { ...c, drafted: true, tapped: true } : c
          ),
          hasDraftedThisTurn: true,
          resources: cost
            ? { ...active.resources, [cost.resource]: active.resources[cost.resource] - cost.amount }
            : active.resources,
        };
        return withLog(
          withActivePlayerState(state, updated),
          `Played Draft on ${definitionOf(target).name} — flipped into Warfare.`
        );
      }

      case "ADVANCE": {
        // Upkeep is entirely absent from the turn loop right now — see
        // phases/index.ts's TURN_PHASES. Nothing else needs to know that;
        // Main is the only phase that has to decide whether to route there.
        // Applies to whichever side is active — dispatched either by the
        // player's own click or by the opponent's Main auto-advancing.
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
