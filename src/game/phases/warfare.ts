import { hasWarfare } from "../components/queries";
import { withLog } from "../helpers";
import type { CardInstance, PlayerState } from "../types";
import type { PhaseDef } from "./types";

/**
 * A side's attacking Warfare total: the contiguous run of untapped cards
 * carrying Warfare, starting at the very front of the lane — see
 * Rules/Front-Line Warfare.md. A drafted card is still whatever Worker it
 * always was (see types.ts's CardInstance.attachments) — this just counts
 * which of them currently carry Warfare (hasWarfare) and are free to use
 * it. Stops at the first card that doesn't have Warfare, or is tapped
 * (including one tapped for its own resource this same turn — see
 * Rules/Turned Warfare Exclusion.md); anything behind that point doesn't
 * count, even if it has Warfare itself (a "country border" — it never
 * reaches the front to fight). Exported so GameBoard can decide whether
 * there's anything to show a sword for, using the exact same rule.
 *
 * The lane array's *end* is the front — new cards are appended there by
 * default (Rules/Deployment Placement.md's "back of the line" is index 0,
 * the deck side), and it's the end rendered next to the lane's arrow/
 * sword and the graveyard, not the deck. So this walks the array
 * backwards, from the last element in.
 */
export function frontLine(lane: CardInstance[]): number {
  let count = 0;
  for (let i = lane.length - 1; i >= 0; i--) {
    const card = lane[i];
    if (!hasWarfare(card) || card.tapped) break;
    count += 1;
  }
  return count;
}

/** Destroys up to `count` cards, sweeping front-to-back (see Rules/Front-
 *  to-Back Destruction Order.md — from the array's end inward). A plain
 *  Worker is destroyed on contact, tapped or not (Rules/Universal
 *  Destructibility.md — card *type* gives no protection). A tapped
 *  Warfare card is not immune, though — it isn't shielded or dodging the
 *  hit. It just isn't a combatant this turn (Rules/Turned Warfare
 *  Exclusion.md — tapped Warfare doesn't count toward *attack or
 *  defense*), so there's nothing there for an attack to actually clash
 *  with: the sweep passes over it for free, same as it would pass over
 *  empty ground, and doesn't consume any of `count`. The real-world
 *  shape: send one soldier to war and keep one training at home — the one
 *  that leaves risks dying in the fight it's actually in; the one that
 *  stays isn't in a fight to begin with. Sweeping continues past a
 *  skipped card into whatever's behind it, so a long enough attack can
 *  still reach through a wall of tapped Warfare to hit an untapped card
 *  further back. Returns the destroyed cards too, so callers can report
 *  an accurate count — `count` itself is only a ceiling, since tapped
 *  Warfare and a short lane can both mean fewer cards actually die than
 *  requested. A destroyed card's attachments (see types.ts's
 *  CardInstance.attachments) go to the graveyard as part of it — nested
 *  inside the same object, not tracked separately, so no extra code is
 *  needed here for that to happen correctly.
 */
function destroyFront(
  side: PlayerState,
  count: number
): { side: PlayerState; destroyed: CardInstance[] } {
  if (count === 0) return { side, destroyed: [] };
  const destroyedIds = new Set<string>();
  let remaining = count;
  for (let i = side.lane.length - 1; i >= 0 && remaining > 0; i--) {
    const card = side.lane[i];
    if (hasWarfare(card) && card.tapped) continue;
    destroyedIds.add(card.instanceId);
    remaining -= 1;
  }
  if (destroyedIds.size === 0) return { side, destroyed: [] };
  const destroyed = side.lane.filter((c) => destroyedIds.has(c.instanceId));
  const lane = side.lane.filter((c) => !destroyedIds.has(c.instanceId));
  return { side: { ...side, lane, graveyard: [...side.graveyard, ...destroyed] }, destroyed };
}

export const warfarePhase: PhaseDef = {
  name: "warfare",
  label: "Warfare",
  // No autoAdvance: the player triggers combat explicitly by clicking the
  // sword (see GameBoard's handleAttack), and the opponent's own click is
  // simulated automatically there too — see RESOLVE_WARFARE below. This
  // narrator is just the announcement, with no timer attached to it.
  narrator: { message: "Warfare Phase", delayMs: 550 },
  // Attacking is optional — the sword is one way to leave this phase, not
  // the only one. The generic Next button (this label) skips it entirely:
  // ADVANCE alone, with no RESOLVE_WARFARE, leaves both front lines
  // exactly as they are.
  nextLabel: (state) => (state.activeSide === "player" ? "To End" : undefined),
  reduce(state, action, ctx) {
    switch (action.type) {
      case "RESOLVE_WARFARE": {
        // Unlike Draw/Main/End, combat is inherently a two-sided
        // comparison — it isn't "whichever side is active" doing
        // something to its own board, so this reads player/opponent
        // directly rather than through activePlayerState. Deliberately
        // split from ADVANCE below: this computes the fight and stays in
        // "warfare" so GameBoard can animate the result (a swing, then
        // the dying cards) before the phase itself moves on.
        //
        // The rule, in full: only drafted, untapped, front-line Warfare
        // can attack (frontLine) — a plain Worker never deals damage,
        // even if it's sitting right at the front. Being hit is a
        // separate question, decided by destroyFront: a Worker is
        // destroyed on contact regardless of type, but a tapped Warfare
        // card is skipped — off doing something else this turn, not
        // standing in formation to be hit (see destroyFront's own
        // comment). So combat is two passes, not one: a matched trade
        // between the two attacking totals (guaranteed to hit drafted,
        // untapped Warfare on both sides, since neither total can exceed
        // what's actually drafted and untapped there), then whichever
        // side has leftover attacking power keeps going, sweeping further
        // into the *other* side's front for more targets.
        const playerFront = frontLine(state.player.lane);
        const opponentFront = frontLine(state.opponent.lane);
        const matched = Math.min(playerFront, opponentFront);
        const leftover = Math.abs(playerFront - opponentFront);

        const playerMatched = destroyFront(state.player, matched);
        const opponentMatched = destroyFront(state.opponent, matched);
        let player = playerMatched.side;
        let opponent = opponentMatched.side;
        let message: string;

        if (matched === 0 && leftover === 0) {
          message = "Warfare: no Warfare on either front line. No conflict.";
        } else if (leftover === 0) {
          message = `Warfare: ${matched} Warfare on each side clashed and destroyed each other. No survivors on the front line.`;
        } else if (playerFront > opponentFront) {
          const result = destroyFront(opponent, leftover);
          opponent = result.side;
          message = `Warfare: your ${leftover} leftover Warfare broke through, destroying ${result.destroyed.length} more of the opponent's front line.`;
        } else {
          const result = destroyFront(player, leftover);
          player = result.side;
          message = `Warfare: the opponent's ${leftover} leftover Warfare broke through, destroying ${result.destroyed.length} more of your front line.`;
        }

        const gameOver = player.lane.length === 0 || opponent.lane.length === 0;
        return withLog({ ...state, player, opponent, gameOver }, message);
      }

      case "ADVANCE":
        // Pure phase transition — the fight (if any) already resolved via
        // RESOLVE_WARFARE above; this just moves on once GameBoard's
        // animation has had time to show it.
        return { ...state, phase: ctx.nextAfter("warfare") };

      default:
        return undefined;
    }
  },
};
