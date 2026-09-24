import { costOf, definitionOf, hasDraftAbility, resourceGeneratedBy } from "./components/queries";
import type { GameState, PlayerState } from "./types";

/**
 * A minimal, deterministic opponent for the Main phase: maybe play a
 * Draft card from hand on its front-most eligible worker, tap every
 * remaining untapped lane worker that generates something, then place the
 * first card in hand if it hasn't placed one yet this turn. No positional
 * choice (always the back — see Rules/Deployment Placement.md's default),
 * no lookahead. Same rules the player has, applied without an actual
 * decision behind them — a placeholder to make the opponent a real
 * participant, not a strategy.
 */
export function runOpponentMainPhase(state: GameState): GameState {
  let opponent: PlayerState = state.opponent;
  const log = [...state.log];

  // Drafts the front-most untapped, undrafted worker into Warfare, using
  // the first Draft card in hand — but only when there are at least 2
  // untapped workers to begin with, so drafting never leaves the economy
  // with nothing to tap this turn. A dumb, cautious heuristic, not a real
  // military strategy — but it has to at least pick from the front (the
  // *last* element, see Rules/Front-Line Warfare.md and warfare.ts's
  // frontLine), not the back: the back is where new Workers keep
  // arriving (Rules/Deployment Placement.md), so picking the rearmost
  // eligible card every time would always draft the newest arrival and
  // permanently strand the opponent's oldest, undrafted Worker at the
  // front, blocking its own front line forever (nothing ever drafts *it*,
  // and there's no move action yet to get it out of the way).
  const untapped = opponent.lane.filter((c) => !c.tapped && !c.drafted);
  const draftCard = opponent.hand.find(hasDraftAbility);
  const draftCost = draftCard && costOf(draftCard);
  const canAffordDraft = !draftCost || opponent.resources[draftCost.resource] >= draftCost.amount;
  if (!opponent.hasDraftedThisTurn && draftCard && untapped.length >= 2 && canAffordDraft) {
    const toDraft = untapped[untapped.length - 1];
    opponent = {
      ...opponent,
      hand: opponent.hand.filter((c) => c.instanceId !== draftCard.instanceId),
      graveyard: [...opponent.graveyard, draftCard],
      lane: opponent.lane.map((c) =>
        c.instanceId === toDraft.instanceId ? { ...c, drafted: true, tapped: true } : c
      ),
      hasDraftedThisTurn: true,
      resources: draftCost
        ? {
            ...opponent.resources,
            [draftCost.resource]: opponent.resources[draftCost.resource] - draftCost.amount,
          }
        : opponent.resources,
    };
    log.push(`Opponent played Draft on ${definitionOf(toDraft).name} — flipped into Warfare.`);
  }

  for (const worker of opponent.lane) {
    // A drafted card's definition still has a resourceGenerator component
    // (drafted is just a runtime flip, not a different card), so this has
    // to exclude drafted lane cards explicitly, the same way the player's
    // own canTap does in GameBoard — otherwise every drafted Warfare unit
    // gets re-tapped for its old resource the very next time it untaps
    // (see end.ts), and never reaches Warfare untapped again to fight.
    if (worker.tapped || worker.drafted) continue;
    const generated = resourceGeneratedBy(worker);
    if (!generated) continue;

    opponent = {
      ...opponent,
      lane: opponent.lane.map((c) => (c.instanceId === worker.instanceId ? { ...c, tapped: true } : c)),
      resources: {
        ...opponent.resources,
        [generated.resource]: opponent.resources[generated.resource] + generated.amount,
      },
    };
    log.push(`Opponent tapped ${definitionOf(worker).name} for ${generated.amount} ${generated.resource}.`);
  }

  if (!opponent.hasPlacedWorkerThisTurn && opponent.hand.length > 0) {
    const [placed, ...rest] = opponent.hand;
    // The back of the line is index 0 (the deck side) — see Rules/
    // Deployment Placement.md and warfare.ts's frontLine, which treats
    // the *other* end (array end, next to the arrow/sword) as the front.
    opponent = { ...opponent, hand: rest, lane: [placed, ...opponent.lane], hasPlacedWorkerThisTurn: true };
    log.push(`Opponent placed ${definitionOf(placed).name} into their lane.`);
  }

  return { ...state, opponent, log };
}
