import { runOpponentMainPhase } from "../ai";
import {
  canAfford,
  costOf,
  definitionOf,
  hasWarfare,
  isAttachable,
  isWorker,
  payCost,
  resourceGeneratedBy,
} from "../components/queries";
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
        // Only a Worker can be placed this way — an Action card (Draft)
        // is played by targeting an existing lane card instead (see the
        // DRAFT case below), never by landing in the lane itself.
        if (!card || !isWorker(card)) return undefined;

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
        // A drafted card still has its own resourceGenerator, same as any
        // other Worker (see Rules/Drafting Population Risk.md) — Warfare
        // is an extra thing it has, not a different thing it became.
        // Tapping it this way is a real choice, though: it's also what
        // excludes it from this turn's front line (Rules/Turned Warfare
        // Exclusion.md), so the player is trading this turn's Warfare
        // contribution for this turn's resource, not getting both for
        // free. resourceGeneratedBy below also accounts for whatever a
        // Draft attachment's own resourceGeneratorPenalty has knocked off
        // that output — Draft's -1/-1 fully offsets a Basic Worker's
        // single printed resource, so a freshly drafted Farmer or Builder
        // has nothing left to tap for at all, same net effect as before,
        // just reached generically instead of a hardcoded block.
        if (!card || card.tapped) return undefined;

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

        // The attachable card itself, from hand — a Worker can't draft
        // itself (Rules/Draft Ability.md), so this must be a *different*
        // card that actually carries the ability. Component presence
        // (isAttachable), not a hardcoded "is this the Draft card" check
        // — any future Order card played this same way is already
        // supported here with no change.
        const orderCard = active.hand.find((c) => c.instanceId === action.cardInstanceId);
        if (!orderCard || !isAttachable(orderCard)) return undefined;
        if (action.cardInstanceId === action.targetInstanceId) return undefined;

        const target = active.lane.find((c) => c.instanceId === action.targetInstanceId);
        if (!target || target.tapped || hasWarfare(target)) return undefined;

        // Same as any other card played from hand: its cost (if it has
        // one) has to actually be affordable, checked right before the
        // effect resolves — not reserved or checked any earlier. Draft's
        // own cost has two entries (Food and Labor), both required at once
        // (see components/queries.ts's canAfford).
        const cost = costOf(orderCard);
        if (!canAfford(active.resources, cost)) return undefined;

        // The Order card leaves the hand but isn't consumed to the
        // graveyard — it joins the target's attachments and stays there
        // (see types.ts's CardInstance.attachments and Rules/Draft
        // Ability.md), like an equipment sitting behind its host. The
        // target is tapped in the same action (same as a creature
        // entering tapped), so it can't also tap for a resource or move
        // this same turn, same as any other already-tapped card.
        const updated: PlayerState = {
          ...active,
          hand: active.hand.filter((c) => c.instanceId !== orderCard.instanceId),
          lane: active.lane.map((c) =>
            c.instanceId === target.instanceId
              ? { ...c, tapped: true, attachments: [...c.attachments, orderCard] }
              : c
          ),
          hasDraftedThisTurn: true,
          resources: payCost(active.resources, cost),
        };
        return withLog(
          withActivePlayerState(state, updated),
          `Attached Draft to ${definitionOf(target).name} — gave it 1 Warfare.`
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
