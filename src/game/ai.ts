import {
  canAfford,
  costOf,
  definitionOf,
  hasWarfare,
  isAttachable,
  isWorker,
  payCost,
  resourceGeneratedBy,
} from "./components/queries";
import { frontLine } from "./phases/warfare";
import type { CardInstance, Difficulty, GameState, PlayerState } from "./types";

/**
 * What actually varies between difficulty levels — every level runs the
 * exact same Main-phase/attack *procedure* (see runOpponentMainPhase and
 * shouldOpponentAttack below), just with different numbers/answers fed
 * into it. New levels are a new table row, not a new code path.
 */
interface AiPolicy {
  /** Untapped, undrafted workers required (inclusive of the one being
   *  committed) before drafting one into Warfare — see the drafting block
   *  below. Higher = keeps a bigger economic cushion in reserve before
   *  spending a Worker on the military. `null` = never drafts at all. */
  minUntappedToDraft: number | null;
  /** Tap every untapped Worker unconditionally, whether or not anything
   *  this turn actually needs the resource — "dumb"'s original, unplanned
   *  behavior, kept as-is. Every other level taps only what a planned
   *  action this turn actually needs (see the tapping block below): Food
   *  and Labor's only consumer is this turn's own Draft (Upkeep is
   *  disabled — see phases/index.ts's TURN_PHASES), and *unspent*
   *  resources vanish at End regardless (see end.ts) — so tapping beyond
   *  that plan has no payoff, just activity for its own sake. This is the
   *  difference between "the opponent is doing something" and "the
   *  opponent is doing something *for a reason*". */
  tapEverythingUnconditionally: boolean;
  /** Prefer whichever hand Worker generates the resource an in-hand Draft
   *  card is still short on, instead of just the first Worker in hand —
   *  set up next turn's draft instead of placing arbitrarily. */
  prioritizeResourceForDraft: boolean;
  /** Whether to commit to a fight this turn, given both sides' current
   *  front-line Warfare totals (see warfare.ts's frontLine) — combat's
   *  outcome is fully determined by these two numbers (a matched trade
   *  plus whichever side has leftover), so there's nothing else to weigh. */
  shouldAttack(attackerFront: number, defenderFront: number): boolean;
}

/**
 * Choosing the *front-most* untapped/undrafted Worker as the draft target
 * (see the comment on that below) is always correct in the current
 * ruleset, for every level that drafts at all — any other choice would
 * build the front line no faster. So that part never varies by policy;
 * only what's below does.
 */
export const AI_POLICIES: Record<Difficulty, AiPolicy> = {
  // The original single-strategy opponent this game shipped with, kept as
  // its own selectable level rather than quietly folded into "easy" or
  // "normal" once real levels existed. Its *decisions* are unchanged —
  // tap everything, draft opportunistically, always swing — but see the
  // procedure-level bug fix note in runOpponentMainPhase: the order those
  // decisions execute in had to change for any of them to actually work.
  dumb: {
    minUntappedToDraft: 2,
    tapEverythingUnconditionally: true,
    prioritizeResourceForDraft: false,
    shouldAttack: (attackerFront) => attackerFront > 0, // swings with anything it has, win or lose
  },
  // Never drafts at all — a pure economy bot with no Warfare of its own,
  // so it never has anything to attack with either, and (per
  // tapEverythingUnconditionally's own comment) no reason to tap anything
  // either, since it never plans to spend a resource on anything. Strictly
  // weaker than "dumb", which at least occasionally builds a front line.
  easy: {
    minUntappedToDraft: null,
    tapEverythingUnconditionally: false,
    prioritizeResourceForDraft: false,
    shouldAttack: () => false,
  },
  // Same drafting/economy as dumb, but taps only what a planned draft
  // actually needs, and only fights when the trade is at worst even (see
  // shouldOpponentAttack) instead of swinging blind.
  normal: {
    minUntappedToDraft: 2,
    tapEverythingUnconditionally: false,
    prioritizeResourceForDraft: false,
    shouldAttack: (attackerFront, defenderFront) => attackerFront > 0 && attackerFront >= defenderFront,
  },
  // Keeps a deeper economic reserve before committing a Worker to Warfare,
  // itemizes hand placement to actually afford its next draft sooner, and
  // only fights when it's strictly winning — an even trade still costs it
  // real Workers for no net gain, so hard declines those too.
  hard: {
    minUntappedToDraft: 3,
    tapEverythingUnconditionally: false,
    prioritizeResourceForDraft: true,
    shouldAttack: (attackerFront, defenderFront) => attackerFront > defenderFront,
  },
};

/** Which hand Worker to place this turn — see AiPolicy's
 *  prioritizeResourceForDraft. Falls back to the first Worker in hand
 *  (hand order is otherwise meaningless — nothing sorts it) whenever the
 *  policy doesn't care, or there's no Draft card to plan around, or
 *  there's already enough of the needed resource banked. */
function pickWorkerToPlace(policy: AiPolicy, opponent: PlayerState): CardInstance | undefined {
  const workers = opponent.hand.filter(isWorker);
  if (workers.length === 0) return undefined;
  if (!policy.prioritizeResourceForDraft) return workers[0];

  const draftCard = opponent.hand.find(isAttachable);
  const cost = draftCard && costOf(draftCard);
  // Which one of the cost's (possibly several) resource entries is still
  // short — placement can only address one shortfall per turn (one Worker
  // placed), so pick the first one still unmet rather than trying to
  // reason about all of them at once.
  const shortEntry = cost?.find((entry) => opponent.resources[entry.resource] < entry.amount);
  if (!shortEntry) return workers[0];

  return workers.find((w) => resourceGeneratedBy(w)?.resource === shortEntry.resource) ?? workers[0];
}

/** Taps one Worker for its resource, if it has one — shared by both the
 *  "tap everything" and "tap just enough" paths below so the actual
 *  state update only lives in one place. */
function tapWorker(opponent: PlayerState, worker: CardInstance, log: string[]): PlayerState {
  const generated = resourceGeneratedBy(worker);
  if (!generated) return opponent;
  log.push(`Opponent tapped ${definitionOf(worker).name} for ${generated.amount} ${generated.resource}.`);
  return {
    ...opponent,
    lane: opponent.lane.map((c) => (c.instanceId === worker.instanceId ? { ...c, tapped: true } : c)),
    resources: {
      ...opponent.resources,
      [generated.resource]: opponent.resources[generated.resource] + generated.amount,
    },
  };
}

/**
 * The opponent's whole Main-phase turn: maybe play a Draft card from hand
 * on its front-most eligible worker, tap whatever that plan (or, for
 * "dumb", blanket habit) calls for, then place a Worker from hand if it
 * hasn't placed one yet this turn. No positional choice on placement
 * (always the back — see Rules/Deployment Placement.md's default), no
 * combat lookahead here (see shouldOpponentAttack for that, called
 * separately once Warfare begins). Which of these choices happen at all,
 * and how, comes entirely from state.difficulty's AiPolicy above.
 *
 * Decides *whether* to draft, and *which* Worker it would target, before
 * any tapping happens this turn — not just for the front-most heuristic
 * below, but because resources reset to 0 every turn (see end.ts), so
 * tapping has to happen *before* a same-turn draft can ever be paid for.
 * An earlier version of this function drafted first and tapped after,
 * which meant the affordability check always saw last turn's already-
 * reset-to-0 resources and could only ever succeed by accident, from a
 * test seeding resources no real turn could produce — drafting was
 * silently dead in actual play, at every difficulty. The target Worker
 * itself is carved out of the tappable pool the whole way through (Rules/
 * Draft Ability.md: only an *untapped* Worker can be drafted), so tapping
 * for its own cost can never tap away the very card it's trying to fund.
 */
export function runOpponentMainPhase(state: GameState): GameState {
  const policy = AI_POLICIES[state.difficulty];
  let opponent: PlayerState = state.opponent;
  const log = [...state.log];

  // It has to pick from the front (the *last* element, see Rules/Front-
  // Line Warfare.md and warfare.ts's frontLine), not the back: the back is
  // where new Workers keep arriving (Rules/Deployment Placement.md), so
  // picking the rearmost eligible card every time would always draft the
  // newest arrival and permanently strand the opponent's oldest, undrafted
  // Worker at the front, blocking its own front line forever (nothing
  // ever drafts *it*, and there's no move action yet to get it out of the
  // way).
  // Only Workers that don't already carry Warfare are eligible draft
  // targets — a previously-drafted Worker can't be drafted again (Rules/
  // Draft Ability.md's "lasting change"). Funding the cost is a separate
  // question (see `tappable` below): a drafted Worker may still generate
  // *some* resource (Draft's penalty only fully offsets a Basic Worker's
  // single printed resource — see Rules/Draft Ability.md), so it's a
  // perfectly fine thing to try tapping for Draft's own cost.
  const draftTargets = opponent.lane.filter((c) => !c.tapped && !hasWarfare(c));
  const draftCard = opponent.hand.find(isAttachable);
  const draftCost = draftCard && costOf(draftCard);
  const wantsToDraft =
    policy.minUntappedToDraft !== null &&
    !opponent.hasDraftedThisTurn &&
    !!draftCard &&
    draftTargets.length >= policy.minUntappedToDraft;
  const toDraft = wantsToDraft ? draftTargets[draftTargets.length - 1] : undefined;
  // Every untapped Worker can help fund the cost — including one already
  // carrying Warfare from an earlier turn — except the chosen target
  // itself, which only an *untapped* Worker can be drafted, so tapping for
  // the cost can never tap away the very card being funded.
  const tappable = opponent.lane.filter((c) => !c.tapped && c.instanceId !== toDraft?.instanceId);

  // Draft's cost has several entries (Food and Labor) that all have to be
  // met at once. Check up front whether tapping everything tappable could
  // even reach that, using the same "no payoff, don't bother" reasoning as
  // tapEverythingUnconditionally's own comment: tapping toward a plan that
  // can never succeed is just activity for its own sake.
  const projectedResources = { ...opponent.resources };
  for (const worker of tappable) {
    const generated = resourceGeneratedBy(worker);
    if (generated) projectedResources[generated.resource] += generated.amount;
  }

  if (policy.tapEverythingUnconditionally) {
    for (const worker of tappable) opponent = tapWorker(opponent, worker, log);
  } else if (toDraft && draftCost && canAfford(projectedResources, draftCost)) {
    // Tap only enough Workers to cover whichever cost entries are still
    // short, and stop the moment the whole cost is covered — see
    // tapEverythingUnconditionally's own comment for why tapping anything
    // beyond that has no payoff.
    for (const worker of tappable) {
      if (canAfford(opponent.resources, draftCost)) break;
      const generated = resourceGeneratedBy(worker);
      const fundsAShortage =
        generated &&
        draftCost.some((c) => c.resource === generated.resource && opponent.resources[c.resource] < c.amount);
      if (!fundsAShortage) continue;
      opponent = tapWorker(opponent, worker, log);
    }
  }
  // Otherwise (not drafting this turn, or the plan can never be afforded
  // even with everything tappable): tap nothing. There's no plan this turn
  // a resource would serve.

  const canAffordDraft = canAfford(opponent.resources, draftCost);
  if (toDraft && draftCard && canAffordDraft) {
    opponent = {
      ...opponent,
      hand: opponent.hand.filter((c) => c.instanceId !== draftCard.instanceId),
      lane: opponent.lane.map((c) =>
        c.instanceId === toDraft.instanceId
          ? { ...c, tapped: true, attachments: [...c.attachments, draftCard] }
          : c
      ),
      hasDraftedThisTurn: true,
      resources: payCost(opponent.resources, draftCost),
    };
    log.push(`Opponent attached Draft to ${definitionOf(toDraft).name} — gave it 1 Warfare.`);
  }

  const toPlace = pickWorkerToPlace(policy, opponent);
  if (!opponent.hasPlacedWorkerThisTurn && toPlace) {
    // The back of the line is index 0 (the deck side) — see Rules/
    // Deployment Placement.md and warfare.ts's frontLine, which treats
    // the *other* end (array end, next to the arrow/sword) as the front.
    opponent = {
      ...opponent,
      hand: opponent.hand.filter((c) => c.instanceId !== toPlace.instanceId),
      lane: [toPlace, ...opponent.lane],
      hasPlacedWorkerThisTurn: true,
    };
    log.push(`Opponent placed ${definitionOf(toPlace).name} into their lane.`);
  }

  return { ...state, opponent, log };
}

/** Whether the opponent commits to a fight this turn — see AiPolicy's
 *  shouldAttack. Combat's outcome is fully decided by both sides' current
 *  front-line totals (see warfare.ts's RESOLVE_WARFARE), so there's
 *  nothing to simulate here, just compare the two. Called by GameBoard
 *  once the opponent's Warfare phase begins, in place of the old
 *  unconditional "attack with anything, whatever it faces" check. */
export function shouldOpponentAttack(state: GameState): boolean {
  const policy = AI_POLICIES[state.difficulty];
  return policy.shouldAttack(frontLine(state.opponent.lane), frontLine(state.player.lane));
}
