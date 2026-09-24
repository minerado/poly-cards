import { describe, expect, it, vi } from "vitest";
import { runOpponentMainPhase, shouldOpponentAttack } from "../ai";
import { hasWarfare } from "../components/queries";
import { setupGame } from "../setup";
import type { CardInstance, GameState, PlayerState } from "../types";
import { drawPhase } from "./draw";
import { endPhase } from "./end";
import { createReducer, gameReducer } from "./index";
import { mainPhase } from "./main";
import { upkeepPhase } from "./upkeep";
import { warfarePhase } from "./warfare";

// The reducer with Upkeep explicitly included, for exercising its logic
// directly (see the "upkeep" describe block) even while it's absent from
// the real TURN_PHASES the app ships with.
const reducerWithUpkeep = createReducer([drawPhase, mainPhase, upkeepPhase, warfarePhase, endPhase]);

function card(
  defId: string,
  instanceId: string,
  tapped = false,
  attachments: CardInstance[] = []
): CardInstance {
  return { instanceId, defId, tapped, attachments };
}

/** A Worker carrying Warfare, for tests that just need front-line combat
 *  math and don't care how it got there — attaches a real "draft" card
 *  instance (not a synthetic stub), so hasWarfare and resourceGeneratedBy
 *  resolve through the actual registry data, exactly like in play. */
function draftedCard(defId: string, instanceId: string, tapped = false): CardInstance {
  return card(defId, instanceId, tapped, [card("draft", `${instanceId}-draft`, true)]);
}

/** A minimal, fully-controlled state for testing one action at a time,
 *  bypassing setupGame()'s randomness — including its coin toss: unless a
 *  test says otherwise, it's deterministically the player's turn, since
 *  that's what nearly every test here is actually about. Tests covering
 *  the opponent's turn or the coin toss itself override activeSide/
 *  firstSide explicitly (see the "opponent's turn" and "turn order"
 *  describe blocks). */
function stateWith(
  overrides: Partial<Omit<GameState, "player" | "opponent">> & {
    player?: Partial<PlayerState>;
    opponent?: Partial<PlayerState>;
  }
): GameState {
  const base = setupGame();
  return {
    ...base,
    activeSide: "player",
    firstSide: "player",
    ...overrides,
    player: { ...base.player, ...overrides.player },
    opponent: { ...base.opponent, ...overrides.opponent },
  };
}

describe("setupGame", () => {
  it("starts at the coin toss with a 7-card hand and an empty lane", () => {
    const state = setupGame();
    expect(state.phase).toBe("coinToss");
    expect(state.player.hand).toHaveLength(7);
    expect(state.player.lane).toHaveLength(0);
    expect(state.player.deck).toHaveLength(18); // 25-card deck - 7 dealt
    expect(state.turn).toBe(1);
    expect(state.gameOver).toBe(false);
  });

  it("deals the opponent a real, independent board — not a copy of the player's", () => {
    const state = setupGame();
    expect(state.opponent.hand).toHaveLength(7);
    expect(state.opponent.lane).toHaveLength(0);
    expect(state.opponent.deck).toHaveLength(18);

    // Genuinely separate decks, not aliased or mirrored: no shared instance ids.
    const playerIds = new Set(
      [...state.player.hand, ...state.player.deck].map((c) => c.instanceId)
    );
    const opponentIds = [...state.opponent.hand, ...state.opponent.deck].map(
      (c) => c.instanceId
    );
    expect(opponentIds.some((id) => playerIds.has(id))).toBe(false);
  });
});

describe("coin toss", () => {
  it("CONFIRM_COIN_TOSS moves from coinToss to mulligan", () => {
    const state = setupGame();
    const result = gameReducer(state, { type: "CONFIRM_COIN_TOSS" });
    expect(result.phase).toBe("mulligan");
  });

  it("is a no-op for any other action", () => {
    const state = setupGame();
    expect(gameReducer(state, { type: "CONFIRM_MULLIGAN" })).toBe(state);
    expect(gameReducer(state, { type: "ADVANCE" })).toBe(state);
  });
});

describe("mulligan", () => {
  /** Every mulligan test is about what happens once the coin toss reveal
   *  has already been dismissed — setupGame() itself now starts one phase
   *  earlier (see the "coin toss" describe block above). */
  function afterCoinToss(state: GameState): GameState {
    return gameReducer(state, { type: "CONFIRM_COIN_TOSS" });
  }

  it("shrinks the hand by exactly 1 each round, down to a 1-card floor", () => {
    let state = afterCoinToss(setupGame());
    const sizes = [state.player.hand.length];
    for (let i = 0; i < 6; i += 1) {
      state = gameReducer(state, { type: "CONFIRM_MULLIGAN" });
      sizes.push(state.player.hand.length);
    }
    expect(sizes).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(state.phase).toBe("mulligan"); // still asking, never auto-finishes
  });

  it("refuses to mulligan a 1-card hand", () => {
    const oneCard = stateWith({ phase: "mulligan", player: { hand: [card("farmer", "f1")] } });
    const result = gameReducer(oneCard, { type: "CONFIRM_MULLIGAN" });
    expect(result).toBe(oneCard); // unchanged reference — a true no-op
  });

  it("shuffles discarded cards back into the deck (deck grows, total stays constant)", () => {
    const before = afterCoinToss(setupGame());
    const totalBefore = before.player.hand.length + before.player.deck.length;
    const after = gameReducer(before, { type: "CONFIRM_MULLIGAN" });
    const totalAfter = after.player.hand.length + after.player.deck.length;
    expect(totalAfter).toBe(totalBefore);
    expect(after.player.deck.length).toBe(before.player.deck.length + 1);
  });

  it("FINISH_MULLIGAN moves to the first turn phase (untap) without changing the hand", () => {
    const state = afterCoinToss(setupGame());
    const result = gameReducer(state, { type: "FINISH_MULLIGAN" });
    expect(result.phase).toBe("untap");
    expect(result.player.hand).toEqual(state.player.hand);
  });

  it("is a no-op outside the mulligan phase", () => {
    const mainState = stateWith({ phase: "main" });
    expect(gameReducer(mainState, { type: "CONFIRM_MULLIGAN" })).toBe(mainState);
    expect(gameReducer(mainState, { type: "FINISH_MULLIGAN" })).toBe(mainState);
  });
});

describe("draw phase", () => {
  it("draws 1 card and advances to main", () => {
    const state = stateWith({
      phase: "draw",
      player: { deck: [card("farmer", "d1")], hand: [] },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("main");
    expect(result.player.hand.map((c) => c.instanceId)).toEqual(["d1"]);
    expect(result.player.deck).toHaveLength(0);
  });

  it("still advances to main with an empty deck (no card drawn)", () => {
    const state = stateWith({ phase: "draw", player: { deck: [], hand: [] } });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("main");
    expect(result.player.hand).toHaveLength(0);
  });
});

describe("opponent's turn", () => {
  it("draws a card for the opponent on its own Draw phase — and only the opponent", () => {
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      player: { deck: [card("farmer", "d1")], hand: [] },
      opponent: { deck: [card("builder", "od1")], hand: [], lane: [] },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.deck).toHaveLength(0);
    expect(result.player.deck).toHaveLength(1); // untouched — not the player's turn
    // Entering Main immediately runs the opponent's own turn too (see
    // below), so the drawn card may already be on the lane rather than
    // still in hand — check it landed somewhere, not exactly where.
    const opponentCardIds = [...result.opponent.hand, ...result.opponent.lane].map((c) => c.instanceId);
    expect(opponentCardIds).toContain("od1");
  });

  it("taps nothing when it isn't planning to draft this turn (below threshold) — no plan, no reason to tap", () => {
    // Only 1 untapped worker: below the AI's own draft threshold (see
    // game/ai.ts), so there's no draft to fund. Food has no consumer at
    // all right now (Upkeep is disabled) and unspent resources vanish at
    // End regardless (see end.ts) — so a policy that plans its taps (every
    // level except "dumb") taps nothing rather than generating Food no
    // turn will ever spend.
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        hand: [],
        lane: [card("farmer", "ol1")],
        resources: { Food: 0, Labor: 0 },
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("main");
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.opponent.lane[0].tapped).toBe(false);
  });

  it("dumb still taps everything unconditionally, even with nothing to spend it on — its original, unplanned behavior", () => {
    const state = stateWith({
      difficulty: "dumb",
      phase: "draw",
      activeSide: "opponent",
      opponent: { deck: [], hand: [], lane: [card("farmer", "ol1")], resources: { Food: 0, Labor: 0 } },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.resources).toEqual({ Food: 1, Labor: 0 });
    expect(result.opponent.lane[0].tapped).toBe(true);
  });

  it("taps exactly the Workers a planned Draft needs to afford both sides of its cost, drafts within the same turn, and leaves the target untouched by the tapping itself", () => {
    // This is the actual bug fix: drafting used to be checked *before*
    // this turn's own tapping ran, against resources that are always 0 at
    // the start of a turn (see end.ts) — so it could only ever succeed
    // from a test that seeded already-banked resources no real turn could
    // produce. It was silently dead in real play, at every difficulty.
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        hand: [card("draft", "od1")],
        // Front-most (array end) is ol3, the draft target -- reserved
        // untapped the whole way through (a Draft can only target an
        // untapped Worker). Draft costs 2 Food + 1 Labor, so all three
        // other Workers are needed to fund it: two Food sources (ol0,
        // ol1) for the Food side, one Labor source (ol2) for the Labor
        // side -- nothing here is more than exactly enough.
        lane: [
          card("farmer", "ol0"),
          card("farmer", "ol1"),
          card("builder", "ol2"),
          card("builder", "ol3"),
        ],
        resources: { Food: 0, Labor: 0 },
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("main");
    expect(result.opponent.lane[0]).toMatchObject({ instanceId: "ol0", tapped: true });
    expect(result.opponent.lane[1]).toMatchObject({ instanceId: "ol1", tapped: true });
    expect(result.opponent.lane[2]).toMatchObject({ instanceId: "ol2", tapped: true });
    expect(result.opponent.lane[3]).toMatchObject({ instanceId: "ol3", tapped: true });
    expect(hasWarfare(result.opponent.lane[3])).toBe(true); // the target, and only the target
    expect(result.opponent.lane.slice(0, 3).every((c) => !hasWarfare(c))).toBe(true);
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 }); // tapped for it, then spent it
    expect(result.opponent.hasDraftedThisTurn).toBe(true);
    expect(result.opponent.hand).toHaveLength(0);
    expect(result.opponent.graveyard).toHaveLength(0); // attached, not discarded
  });

  it("doesn't draft (and doesn't tap anything) when what's tappable could never cover both sides of the cost", () => {
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        // A second card so the end-of-turn placement step doesn't consume
        // the Draft card itself -- that'd be a separate, unrelated
        // behavior this test isn't about.
        hand: [card("farmer", "oh1"), card("draft", "od1")],
        // Draft costs 2 Food + 1 Labor. The only Labor source (the
        // builder) is the front-most/draft target itself -- untappable,
        // since only an untapped Worker can be drafted -- and the farmer
        // only generates Food (and only 1 of the 2 needed, at that). Even
        // tapping everything tappable can never reach the Labor side of
        // the cost, so the plan is abandoned before any tapping happens
        // at all (see runOpponentMainPhase's own "no payoff, don't
        // bother" reasoning).
        lane: [card("farmer", "ol1"), card("builder", "ol2")],
        resources: { Food: 0, Labor: 0 },
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.lane.every((c) => !hasWarfare(c))).toBe(true);
    expect(result.opponent.lane.every((c) => !c.tapped)).toBe(true); // no payoff, so nothing was tapped either
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.opponent.hasDraftedThisTurn).toBe(false);
    expect(result.opponent.hand.map((c) => c.instanceId)).toEqual(["od1"]); // Draft card unspent
  });

  it("doesn't draft without a Draft card in hand, and taps nothing either — no plan, nothing to fund", () => {
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        hand: [], // no Draft card -- a Worker still can't draft itself
        lane: [card("farmer", "ol1"), card("builder", "ol2")],
        resources: { Food: 0, Labor: 0 },
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.lane.every((c) => !hasWarfare(c))).toBe(true);
    expect(result.opponent.lane.every((c) => !c.tapped)).toBe(true);
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.opponent.hasDraftedThisTurn).toBe(false);
  });

  it("places the opponent's first hand card into their lane once per turn", () => {
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        hand: [card("farmer", "oh1"), card("builder", "oh2")],
        lane: [],
        hasPlacedWorkerThisTurn: false,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.lane.map((c) => c.instanceId)).toEqual(["oh1"]);
    expect(result.opponent.hand.map((c) => c.instanceId)).toEqual(["oh2"]);
    expect(result.opponent.hasPlacedWorkerThisTurn).toBe(true);
  });

  it("skips a Draft card in hand and places the first actual Worker instead — a Draft card is never a valid lane placement", () => {
    // Reproduces a real bug: the placement step used to just take hand[0]
    // unconditionally, so a Draft card sitting first in hand landed in
    // the lane as if it were a Worker.
    const state = stateWith({
      phase: "draw",
      activeSide: "opponent",
      opponent: {
        deck: [],
        hand: [card("draft", "od1"), card("farmer", "oh1")],
        lane: [],
        hasPlacedWorkerThisTurn: false,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.lane.map((c) => c.defId)).toEqual(["farmer"]);
    expect(result.opponent.hand.map((c) => c.instanceId)).toEqual(["od1"]); // Draft card untouched, still in hand
  });

  it("does not place a second opponent worker once one's already placed this turn", () => {
    const state = stateWith({
      opponent: { hand: [card("farmer", "oh1")], lane: [], hasPlacedWorkerThisTurn: true },
    });
    const result = runOpponentMainPhase(state);
    expect(result.opponent.lane).toHaveLength(0);
    expect(result.opponent.hand).toHaveLength(1);
  });

  it("refuses PLACE_WORKER and TAP_WORKER — the player can't act out of turn", () => {
    const state = stateWith({
      phase: "main",
      activeSide: "opponent",
      player: { hand: [card("farmer", "h1")], lane: [card("builder", "l1")] },
    });
    expect(gameReducer(state, { type: "PLACE_WORKER", instanceId: "h1" })).toBe(state);
    expect(gameReducer(state, { type: "TAP_WORKER", instanceId: "l1" })).toBe(state);
  });

  it("resets the opponent's resources/placement state when its End phase resolves, but leaves tapped cards tapped", () => {
    const state = stateWith({
      phase: "end",
      activeSide: "opponent",
      opponent: {
        lane: [card("farmer", "ol1", true)],
        resources: { Food: 2, Labor: 1 },
        hasPlacedWorkerThisTurn: true,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.opponent.hasPlacedWorkerThisTurn).toBe(false);
    // Not untapped here — see untap.ts. A card tapped this turn needs to
    // stay tapped through the other side's entire following turn (that's
    // the whole point of tapping something); untapping too early here
    // would erase that downside before it ever mattered.
    expect(result.opponent.lane[0].tapped).toBe(true);
  });
});

describe("AI difficulty", () => {
  it("easy never drafts, even with plenty of untapped workers and an affordable cost", () => {
    const state = stateWith({
      difficulty: "easy",
      opponent: {
        hand: [card("draft", "od1")],
        lane: [card("farmer", "ol1"), card("builder", "ol2"), card("farmer", "ol3")],
        resources: { Food: 0, Labor: 1 },
      },
    });
    const result = runOpponentMainPhase(state);
    expect(result.opponent.lane.every((c) => !hasWarfare(c))).toBe(true);
    expect(result.opponent.hand.map((c) => c.instanceId)).toEqual(["od1"]);
  });

  it("hard holds back from drafting with only 2 untapped workers (needs 3), where dumb/normal would draft", () => {
    const shared = {
      hand: [card("draft", "od1")],
      // Both Builders (Labor), with Food pre-banked to exactly cover the
      // Food side of Draft's 2 Food + 1 Labor cost -- so tapping the one
      // non-target Builder for Labor is enough to make the whole cost
      // reachable, isolating this test to the *threshold* gate (2 untapped
      // Workers vs. hard's 3) rather than affordability.
      lane: [card("builder", "ol1"), card("builder", "ol2")],
      resources: { Food: 2, Labor: 0 },
    };
    const hardResult = runOpponentMainPhase(stateWith({ difficulty: "hard", opponent: shared }));
    expect(hardResult.opponent.lane.every((c) => !hasWarfare(c))).toBe(true);

    const normalResult = runOpponentMainPhase(stateWith({ difficulty: "normal", opponent: shared }));
    expect(normalResult.opponent.lane.some((c) => hasWarfare(c))).toBe(true);
  });

  it("hard places whichever Worker matches its unaffordable Draft card's cost, instead of just the first in hand", () => {
    // Draft costs 2 Food + 1 Labor (see registry.ts) -- already has
    // enough Food banked, short only on Labor, so hard should reach past
    // the Farmer in hand for the Builder, setting its economy up to
    // afford drafting sooner. Normal/dumb just take hand[0], the Farmer,
    // since they don't plan ahead like this.
    const state = stateWith({
      difficulty: "hard",
      opponent: {
        hand: [card("farmer", "oh1"), card("builder", "oh2"), card("draft", "od1")],
        lane: [],
        resources: { Food: 2, Labor: 0 },
        hasPlacedWorkerThisTurn: false,
      },
    });
    const result = runOpponentMainPhase(state);
    expect(result.opponent.lane.map((c) => c.defId)).toEqual(["builder"]);

    const normalResult = runOpponentMainPhase({ ...state, difficulty: "normal" });
    expect(normalResult.opponent.lane.map((c) => c.defId)).toEqual(["farmer"]);
  });

  it("shouldOpponentAttack: dumb swings with anything, win or lose; normal only when at least even; hard only when strictly winning; easy never", () => {
    // Opponent's front (2) is smaller than the player's (3) — a losing
    // trade for the opponent.
    const losing = stateWith({
      player: { lane: [draftedCard("farmer", "p1"), draftedCard("farmer", "p2"), draftedCard("farmer", "p3")] },
      opponent: { lane: [draftedCard("farmer", "o1"), draftedCard("farmer", "o2")] },
    });
    expect(shouldOpponentAttack({ ...losing, difficulty: "dumb" })).toBe(true);
    expect(shouldOpponentAttack({ ...losing, difficulty: "normal" })).toBe(false);
    expect(shouldOpponentAttack({ ...losing, difficulty: "hard" })).toBe(false);
    expect(shouldOpponentAttack({ ...losing, difficulty: "easy" })).toBe(false);

    // Even front lines (2 vs 2) — a neutral trade.
    const even = stateWith({
      player: { lane: [draftedCard("farmer", "p1"), draftedCard("farmer", "p2")] },
      opponent: { lane: [draftedCard("farmer", "o1"), draftedCard("farmer", "o2")] },
    });
    expect(shouldOpponentAttack({ ...even, difficulty: "normal" })).toBe(true);
    expect(shouldOpponentAttack({ ...even, difficulty: "hard" })).toBe(false);

    // Opponent's front (2) beats the player's (1) — a strictly winning trade.
    const winning = stateWith({
      player: { lane: [draftedCard("farmer", "p1")] },
      opponent: { lane: [draftedCard("farmer", "o1"), draftedCard("farmer", "o2")] },
    });
    expect(shouldOpponentAttack({ ...winning, difficulty: "hard" })).toBe(true);
  });
});

describe("untap phase", () => {
  it("untaps only the side whose turn is starting, not the other side", () => {
    const state = stateWith({
      phase: "untap",
      activeSide: "player",
      player: { lane: [card("farmer", "l1", true)] },
      opponent: { lane: [card("builder", "o1", true)] },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.player.lane[0].tapped).toBe(false);
    expect(result.opponent.lane[0].tapped).toBe(true);
    expect(result.phase).toBe("draw");
  });

  it("leaves a drafted card's attachments alone — untapping doesn't undraft it", () => {
    const state = stateWith({
      phase: "untap",
      player: { lane: [draftedCard("farmer", "l1", true)] },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.player.lane[0].tapped).toBe(false);
    expect(hasWarfare(result.player.lane[0])).toBe(true);
  });

  it("a card tapped on turn 1 is still tapped throughout the opponent's turn, and only clears at the start of the player's next turn", () => {
    // The exact bug this phase fixes: tapping used to be undone by the
    // tapping side's own End phase, so it was already gone before the
    // other side ever got a turn — no real downside to tapping anything.
    const afterPlayerTaps = stateWith({
      phase: "end",
      activeSide: "player",
      firstSide: "player",
      player: { lane: [card("farmer", "l1", true)] },
    });

    const duringOpponentTurn = gameReducer(afterPlayerTaps, { type: "ADVANCE" }); // end -> untap (opponent)
    expect(duringOpponentTurn.activeSide).toBe("opponent");
    expect(duringOpponentTurn.player.lane[0].tapped).toBe(true);

    const stillDuringOpponentTurn = gameReducer(duringOpponentTurn, { type: "ADVANCE" }); // untap -> draw
    expect(stillDuringOpponentTurn.player.lane[0].tapped).toBe(true);

    const opponentEnds = { ...stillDuringOpponentTurn, phase: "end" as const };
    const backToPlayerUntap = gameReducer(opponentEnds, { type: "ADVANCE" }); // end -> untap (player)
    expect(backToPlayerUntap.activeSide).toBe("player");
    expect(backToPlayerUntap.phase).toBe("untap");
    expect(backToPlayerUntap.player.lane[0].tapped).toBe(true); // not yet -- untap hasn't resolved

    const afterPlayerUntaps = gameReducer(backToPlayerUntap, { type: "ADVANCE" }); // untap -> draw
    expect(afterPlayerUntaps.player.lane[0].tapped).toBe(false);
  });
});

describe("main phase", () => {
  it("places a Worker from hand into the lane, once per turn", () => {
    const state = stateWith({
      phase: "main",
      player: { hand: [card("farmer", "h1")], lane: [], hasPlacedWorkerThisTurn: false },
    });
    const placed = gameReducer(state, { type: "PLACE_WORKER", instanceId: "h1" });
    expect(placed.player.hand).toHaveLength(0);
    expect(placed.player.lane.map((c) => c.instanceId)).toEqual(["h1"]);
    expect(placed.player.hasPlacedWorkerThisTurn).toBe(true);

    // A second placement the same turn is refused.
    const secondAttempt = stateWith({
      phase: "main",
      player: { hand: [card("builder", "h2")], lane: [], hasPlacedWorkerThisTurn: true },
    });
    expect(gameReducer(secondAttempt, { type: "PLACE_WORKER", instanceId: "h2" })).toBe(
      secondAttempt
    );
  });

  it("refuses PLACE_WORKER for a non-Worker card (a Draft card can't be placed into the lane)", () => {
    const state = stateWith({
      phase: "main",
      player: { hand: [card("draft", "d1")], lane: [], hasPlacedWorkerThisTurn: false },
    });
    expect(gameReducer(state, { type: "PLACE_WORKER", instanceId: "d1" })).toBe(state);
  });

  it("taps a Farmer for Food and a Builder for Labor", () => {
    const state = stateWith({
      phase: "main",
      player: { lane: [card("farmer", "l1"), card("builder", "l2")] },
    });

    const afterFarmer = gameReducer(state, { type: "TAP_WORKER", instanceId: "l1" });
    expect(afterFarmer.player.resources.Food).toBe(1);
    expect(afterFarmer.player.resources.Labor).toBe(0);
    expect(afterFarmer.player.lane.find((c) => c.instanceId === "l1")?.tapped).toBe(true);

    const afterBuilder = gameReducer(afterFarmer, { type: "TAP_WORKER", instanceId: "l2" });
    expect(afterBuilder.player.resources.Food).toBe(1);
    expect(afterBuilder.player.resources.Labor).toBe(1);
  });

  it("refuses to tap an already-tapped Worker", () => {
    const state = stateWith({
      phase: "main",
      player: { lane: [card("farmer", "l1", true)] },
    });
    const result = gameReducer(state, { type: "TAP_WORKER", instanceId: "l1" });
    expect(result).toBe(state);
  });

  it("a Draft attachment's penalty fully offsets a Basic Worker's resource — tapping a drafted Farmer generates nothing", () => {
    const state = stateWith({
      phase: "main",
      player: { lane: [draftedCard("farmer", "l1")] }, // untapped, already carrying a real Draft attachment
    });
    const result = gameReducer(state, { type: "TAP_WORKER", instanceId: "l1" });
    expect(result).toBe(state); // a full no-op: Draft's -1 Food fully offsets a Farmer's printed 1
  });

  it("attaches a Draft card (rather than discarding it) to an untapped Worker, paying its 2 Food + 1 Labor cost, and the target's own resource is fully offset going forward", () => {
    const state = stateWith({
      phase: "main",
      player: {
        hand: [card("draft", "d1")],
        lane: [card("farmer", "l1")],
        hasDraftedThisTurn: false,
        resources: { Food: 2, Labor: 1 },
      },
    });
    const result = gameReducer(state, {
      type: "DRAFT",
      cardInstanceId: "d1",
      targetInstanceId: "l1",
    });
    const target = result.player.lane[0];
    // Tapped (its action for this turn is spent, same as before), but not
    // flipped and not discarded -- it's still the same Farmer, now with a
    // Draft card attached behind it (see types.ts's CardInstance.attachments).
    expect(target.instanceId).toBe("l1");
    expect(target.tapped).toBe(true);
    expect(target.attachments.map((a) => a.defId)).toEqual(["draft"]);
    expect(hasWarfare(target)).toBe(true);
    expect(result.player.hand).toHaveLength(0);
    expect(result.player.graveyard).toHaveLength(0); // attached, not discarded
    expect(result.player.hasDraftedThisTurn).toBe(true);
    expect(result.player.resources).toEqual({ Food: 0, Labor: 0 }); // 2 Food + 1 Labor spent

    // Next turn, once untapped, its own resource generation is fully
    // offset by the attachment's penalty (see components/queries.ts's
    // resourceGeneratedBy) -- tapping it does nothing productive.
    const untappedState = {
      ...result,
      player: { ...result.player, lane: [{ ...target, tapped: false }] },
    };
    expect(gameReducer(untappedState, { type: "TAP_WORKER", instanceId: "l1" })).toBe(untappedState);

    // A second draft the same turn is refused, even with another Draft
    // card, a different target, and resources to spare.
    const secondAttempt = stateWith({
      phase: "main",
      player: {
        hand: [card("draft", "d2")],
        lane: [card("farmer", "l1"), card("builder", "l2")],
        hasDraftedThisTurn: true,
        resources: { Food: 2, Labor: 1 },
      },
    });
    expect(
      gameReducer(secondAttempt, { type: "DRAFT", cardInstanceId: "d2", targetInstanceId: "l2" })
    ).toBe(secondAttempt);
  });

  it("refuses to draft without enough resources to pay the Draft card's Food+Labor cost", () => {
    const state = stateWith({
      phase: "main",
      player: {
        hand: [card("draft", "d1")],
        lane: [card("farmer", "l1")],
        hasDraftedThisTurn: false,
        resources: { Food: 0, Labor: 0 },
      },
    });
    const result = gameReducer(state, {
      type: "DRAFT",
      cardInstanceId: "d1",
      targetInstanceId: "l1",
    });
    expect(result).toBe(state); // a full no-op, same as any other refused DRAFT
  });

  it("refuses to draft with only one of the two required resources — the cost is all-or-nothing", () => {
    const state = stateWith({
      phase: "main",
      player: {
        hand: [card("draft", "d1")],
        lane: [card("farmer", "l1")],
        hasDraftedThisTurn: false,
        resources: { Food: 2, Labor: 0 }, // Food fully covered, Labor isn't
      },
    });
    const result = gameReducer(state, {
      type: "DRAFT",
      cardInstanceId: "d1",
      targetInstanceId: "l1",
    });
    expect(result).toBe(state);
  });

  it("refuses to draft a tapped or already-drafted target", () => {
    const tappedState = stateWith({
      phase: "main",
      player: { hand: [card("draft", "d1")], lane: [card("farmer", "l1", true)] },
    });
    expect(
      gameReducer(tappedState, { type: "DRAFT", cardInstanceId: "d1", targetInstanceId: "l1" })
    ).toBe(tappedState);

    const draftedState = stateWith({
      phase: "main",
      // Untapped (unlike tappedState above), isolating this to the
      // "already carries Warfare" refusal reason specifically.
      player: { hand: [card("draft", "d1")], lane: [draftedCard("farmer", "l1")] },
    });
    expect(
      gameReducer(draftedState, { type: "DRAFT", cardInstanceId: "d1", targetInstanceId: "l1" })
    ).toBe(draftedState);
  });

  it("a Worker cannot draft itself, and only a card with the Draft ability can be played as one", () => {
    // Same instanceId for both fields -- structurally guards the
    // invariant even though the UI could never actually produce this.
    const selfState = stateWith({
      phase: "main",
      player: { hand: [], lane: [card("farmer", "l1")] },
    });
    expect(
      gameReducer(selfState, { type: "DRAFT", cardInstanceId: "l1", targetInstanceId: "l1" })
    ).toBe(selfState);

    // A plain Worker in hand has no draft ability -- it can't be played as one.
    const wrongCardState = stateWith({
      phase: "main",
      player: { hand: [card("farmer", "h1")], lane: [card("builder", "l1")] },
    });
    expect(
      gameReducer(wrongCardState, { type: "DRAFT", cardInstanceId: "h1", targetInstanceId: "l1" })
    ).toBe(wrongCardState);
  });
});

describe("upkeep", () => {
  it("is absent from the real turn loop — Main always skips straight to Warfare, no matter the Food deficit", () => {
    const state = stateWith({
      phase: "main",
      player: {
        lane: [card("builder", "l1"), card("builder", "l2"), card("builder", "l3")],
        resources: { Food: 0, Labor: 0 }, // would be a deficit of 3 if Upkeep were in the loop
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("warfare");
    expect(result.pendingSacrifices).toBe(0);
    expect(result.player.lane).toHaveLength(3); // nobody was sacrificed
  });

  it("ignores further actions once the game is over", () => {
    const gameOverState = stateWith({ gameOver: true, phase: "upkeep" });
    const result = gameReducer(gameOverState, { type: "ADVANCE" });
    expect(result).toBe(gameOverState);
  });

  // The Food-deficit/sacrifice logic itself is dormant — Upkeep is commented
  // out of the real TURN_PHASES in phases/index.ts while it's still being
  // designed. These tests run it through `reducerWithUpkeep`, a reducer
  // built with Upkeep included, so the logic keeps getting exercised — and
  // doesn't quietly rot — while it's absent from actual play.
  describe("underlying logic (own reducer with Upkeep included)", () => {
    it("skips straight to warfare when Food covers the population", () => {
      const state = stateWith({
        phase: "main",
        player: {
          lane: [card("farmer", "l1"), card("builder", "l2")],
          resources: { Food: 2, Labor: 0 },
        },
      });
      const result = reducerWithUpkeep(state, { type: "ADVANCE" });
      expect(result.phase).toBe("warfare");
      expect(result.pendingSacrifices).toBe(0);
    });

    it("skips to warfare with an empty lane (nothing to feed)", () => {
      const state = stateWith({ phase: "main", player: { lane: [] } });
      const result = reducerWithUpkeep(state, { type: "ADVANCE" });
      expect(result.phase).toBe("warfare");
    });

    it("demands sacrifices for a Food deficit, then moves on once paid", () => {
      const state = stateWith({
        phase: "main",
        player: {
          lane: [card("builder", "l1"), card("builder", "l2"), card("builder", "l3")],
          resources: { Food: 1, Labor: 0 }, // population 3, food 1 -> deficit 2
        },
      });
      const upkeep = reducerWithUpkeep(state, { type: "ADVANCE" });
      expect(upkeep.phase).toBe("upkeep");
      expect(upkeep.pendingSacrifices).toBe(2);

      const afterOne = reducerWithUpkeep(upkeep, {
        type: "SACRIFICE_WORKER",
        instanceId: "l1",
      });
      expect(afterOne.phase).toBe("upkeep");
      expect(afterOne.pendingSacrifices).toBe(1);
      expect(afterOne.player.lane).toHaveLength(2);
      expect(afterOne.player.graveyard.map((c) => c.instanceId)).toEqual(["l1"]);

      const afterTwo = reducerWithUpkeep(afterOne, {
        type: "SACRIFICE_WORKER",
        instanceId: "l2",
      });
      expect(afterTwo.phase).toBe("warfare"); // deficit paid, moves on
      expect(afterTwo.pendingSacrifices).toBe(0);
      expect(afterTwo.player.lane).toHaveLength(1);
      expect(afterTwo.gameOver).toBe(false);
    });

    it("ends the game if sacrifices empty the lane", () => {
      const state = stateWith({
        phase: "upkeep",
        pendingSacrifices: 1,
        player: { lane: [card("farmer", "l1")] },
      });
      const result = reducerWithUpkeep(state, { type: "SACRIFICE_WORKER", instanceId: "l1" });
      expect(result.gameOver).toBe(true);
      expect(result.player.lane).toHaveLength(0);
    });
  });
});

describe("warfare combat", () => {
  // RESOLVE_WARFARE (the fight) and ADVANCE (the phase transition) are
  // deliberately separate actions — see phases/warfare.ts — so GameBoard
  // can animate the result before actually leaving the phase. Most tests
  // here only need RESOLVE_WARFARE; one test covers the split itself.

  it("RESOLVE_WARFARE stays in the warfare phase; ADVANCE is a separate step that moves to End", () => {
    const state = stateWith({
      phase: "warfare",
      player: { lane: [card("farmer", "p1")] },
      opponent: { lane: [card("builder", "o1")] },
    });
    const afterFight = gameReducer(state, { type: "RESOLVE_WARFARE" });
    expect(afterFight.phase).toBe("warfare"); // still here -- nothing to fight with anyway
    expect(afterFight.gameOver).toBe(false);
    expect(afterFight.player.lane).toHaveLength(1);
    expect(afterFight.opponent.lane).toHaveLength(1);

    const afterAdvance = gameReducer(afterFight, { type: "ADVANCE" });
    expect(afterAdvance.phase).toBe("end");
  });

  it("only counts the contiguous, untapped, drafted run at the front of the lane", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        lane: [
          draftedCard("farmer", "p1"), // rear: drafted+untapped, but blocked by p2 ahead of it
          card("farmer", "p2"), // undrafted Worker: blocks anything behind it (toward the rear)
          draftedCard("farmer", "p3"), // front (array end): counts (correct total = 1)
        ],
      },
      // Opponent's front-line is also 1: if the player's front-line is
      // correctly computed as 1 too, this is a TIE (mutual wipe). If the
      // block above were ignored (a bug counting p1 too), the player would
      // show 2 and this would wrongly resolve as a decisive win instead.
      opponent: { lane: [draftedCard("builder", "o1")] },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    expect(result.player.lane.map((c) => c.instanceId)).toEqual(["p1", "p2"]);
    expect(result.player.graveyard.map((c) => c.instanceId)).toEqual(["p3"]);
    expect(result.opponent.lane).toHaveLength(0);
    expect(result.gameOver).toBe(true); // opponent's whole (1-card) lane is now empty
  });

  it("a tapped drafted card doesn't count toward the front line, and is skipped over rather than hit when leftover Warfare breaks through", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        lane: [
          draftedCard("farmer", "p1"), // rear: untapped Warfare, but behind a blocker
          draftedCard("farmer", "p2", true), // front (array end): drafted but tapped -> doesn't count, blocks p1
        ],
      },
      opponent: { lane: [draftedCard("builder", "o1")] },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    // Player's front line is 0 (p2 is tapped, blocking p1) -- so the
    // opponent's 1 leftover Warfare sweeps in to attack. p2 is physically
    // at the front, but being tapped Warfare, it isn't standing in
    // formation to be hit (Rules/Turned Warfare Exclusion.md — tapped
    // Warfare doesn't count toward attack *or defense*, same real-world
    // shape as one soldier shipping out while the other trains at home).
    // The sweep skips past it and reaches p1 instead, which is untapped
    // and dies. p2 survives, still tapped, still blocking.
    expect(result.player.lane.map((c) => c.instanceId)).toEqual(["p2"]);
    expect(result.player.graveyard.map((c) => c.instanceId)).toEqual(["p1"]);
    expect(result.opponent.lane.map((c) => c.instanceId)).toEqual(["o1"]); // untouched leftover
    expect(result.gameOver).toBe(false);
  });

  it("leftover Warfare that only finds tapped Warfare cards to sweep through destroys nothing", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        lane: [draftedCard("farmer", "p1", true), draftedCard("farmer", "p2", true)], // both tapped Warfare, both immune
      },
      opponent: { lane: [draftedCard("builder", "o1")] },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    // playerFront = 0 (p2 is tapped, breaks the run before even reaching
    // p1). leftover = 1 sweeps the whole player lane looking for an
    // untapped target and finds none -- both cards are tapped Warfare, so
    // both are skipped. Nothing dies, even though the attack "landed".
    expect(result.player.lane.map((c) => c.instanceId)).toEqual(["p1", "p2"]);
    expect(result.player.graveyard).toHaveLength(0);
    expect(result.gameOver).toBe(false);
  });

  it("leftover Warfare destroys exactly that many cards from the front, not the whole lane", () => {
    // The exact shape of the original bug: a small Warfare force
    // attacking a much larger but entirely undefended lane (nothing
    // drafted) used to wipe the whole thing out via an unconditional
    // rout. Now it only destroys as many cards as it actually has attack
    // power for -- 1 Warfare kills 1 card here, not all 4.
    const state = stateWith({
      phase: "warfare",
      player: { lane: [draftedCard("farmer", "p1")] }, // 1 front-line Warfare
      opponent: {
        lane: [
          card("builder", "o1"),
          card("builder", "o2"),
          card("builder", "o3"),
          card("builder", "o4"),
        ], // 4 Workers, none drafted -- 0 front-line, but still exposed at the front
      },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    expect(result.player.lane).toHaveLength(1); // untouched leftover, still ready
    expect(result.opponent.lane.map((c) => c.instanceId)).toEqual(["o1", "o2", "o3"]); // o4 (front-most) destroyed
    expect(result.opponent.graveyard.map((c) => c.instanceId)).toEqual(["o4"]);
    expect(result.gameOver).toBe(false);
  });

  it("a decisive win leaves the winner's leftover untouched and routs the loser's whole lane", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        // All 3 front-line Warfare -- no blockers, so order among them
        // doesn't matter for the count, only for which one is nearest
        // the front (array end) once destruction picks a card.
        lane: [
          draftedCard("farmer", "p1"),
          draftedCard("farmer", "p2"),
          draftedCard("farmer", "p3"),
        ],
      },
      opponent: {
        lane: [card("builder", "o2"), draftedCard("builder", "o1")], // o2 rear (Worker), o1 front (array end)
      },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    // matched = min(3,1) = 1. Player loses only its front-most (array-end)
    // card; the 2 leftover survive completely untouched (still untapped).
    expect(result.player.lane.map((c) => c.instanceId)).toEqual(["p1", "p2"]);
    expect(result.player.lane.every((c) => !c.tapped)).toBe(true);
    expect(result.player.graveyard.map((c) => c.instanceId)).toEqual(["p3"]);
    // Opponent's whole lane happens to be wiped, but not via an
    // unconditional rout: matched (1) destroys their front-line o1, then
    // 2 leftover Warfare peels off up to 2 MORE cards from their front —
    // capped at what's actually left (just o2 by then), destroying it too.
    // Not "leftover always empties the whole lane" — here it just happens
    // to have enough leftover to reach everything they had.
    expect(result.opponent.lane).toHaveLength(0);
    expect(result.opponent.graveyard.map((c) => c.instanceId).sort()).toEqual(["o1", "o2"]);
    expect(result.gameOver).toBe(true);
  });

  it("leftover Warfare stops once it runs out, even with more cards left to reach", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        lane: [
          draftedCard("farmer", "p1"),
          draftedCard("farmer", "p2"),
          draftedCard("farmer", "p3"), // 3 front-line Warfare
        ],
      },
      opponent: {
        // 3 Workers behind 1 front-line Warfare -- 4 cards total, but
        // only 1 counts as attacking (frontLine), the rest are exposure,
        // not defense.
        lane: [
          card("builder", "ox1"),
          card("builder", "ox2"),
          card("builder", "ox3"),
          draftedCard("builder", "o1"),
        ],
      },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    // matched = min(3,1) = 1: o1 (opponent's only front-line) trades away.
    // leftover = 2, capped at the 3 Workers actually left -- destroys the
    // front-most 2 of them (ox2, ox3), but stops there. ox1 survives:
    // leftover isn't "however many are left get wiped", just exactly its
    // own amount.
    expect(result.opponent.lane.map((c) => c.instanceId)).toEqual(["ox1"]);
    expect(result.opponent.graveyard.map((c) => c.instanceId)).toEqual(["o1", "ox2", "ox3"]);
    expect(result.gameOver).toBe(false);
  });

  it("equal front-line totals destroy everyone engaged, with no leftover on either side", () => {
    const state = stateWith({
      phase: "warfare",
      player: {
        // p3 (a plain Worker) sits at the rear; p1/p2 (drafted+untapped)
        // are the front two, at the array's end.
        lane: [card("farmer", "p3"), draftedCard("farmer", "p1"), draftedCard("farmer", "p2")],
      },
      opponent: {
        lane: [
          card("builder", "o3"),
          draftedCard("builder", "o1"),
          draftedCard("builder", "o2"),
        ],
      },
    });
    const result = gameReducer(state, { type: "RESOLVE_WARFARE" });
    expect(result.player.lane.map((c) => c.instanceId)).toEqual(["p3"]);
    expect(result.opponent.lane.map((c) => c.instanceId)).toEqual(["o3"]);
    expect(result.player.graveyard.map((c) => c.instanceId)).toEqual(["p1", "p2"]);
    expect(result.opponent.graveyard.map((c) => c.instanceId)).toEqual(["o1", "o2"]);
    // Neither side won outright, and both still have population left.
    expect(result.gameOver).toBe(false);
  });
});

describe("warfare: declining to attack", () => {
  it("offers a Next label only on the player's own turn — the opponent has no button, it auto-attacks", () => {
    function labelFor(activeSide: "player" | "opponent") {
      const s = stateWith({ phase: "warfare", activeSide });
      return typeof warfarePhase.nextLabel === "function"
        ? warfarePhase.nextLabel(s, {} as never)
        : warfarePhase.nextLabel;
    }
    expect(labelFor("player")).toBe("To End");
    expect(labelFor("opponent")).toBeUndefined();
  });

  it("ADVANCE alone (skipping the attack, no RESOLVE_WARFARE) leaves both front lines completely untouched", () => {
    const state = stateWith({
      phase: "warfare",
      player: { lane: [draftedCard("farmer", "p1")] },
      opponent: { lane: [card("builder", "o1")] },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("end");
    expect(result.player.lane).toEqual(state.player.lane);
    expect(result.opponent.lane).toEqual(state.opponent.lane);
    expect(result.gameOver).toBe(false);
  });
});

describe("turn order (coin toss + alternating turns)", () => {
  it("the coin toss picks either side, and activeSide starts equal to firstSide", () => {
    const spy = vi.spyOn(Math, "random");

    spy.mockReturnValue(0); // < 0.5 -> player
    expect(setupGame().firstSide).toBe("player");
    expect(setupGame().activeSide).toBe("player");

    spy.mockReturnValue(0.99); // >= 0.5 -> opponent
    expect(setupGame().firstSide).toBe("opponent");
    expect(setupGame().activeSide).toBe("opponent");

    spy.mockRestore();
  });

  it("End hands off to the other side, same round, when the first side finishes", () => {
    const state = stateWith({
      phase: "end",
      turn: 1,
      firstSide: "player",
      activeSide: "player",
      player: {
        lane: [card("farmer", "l1", true)],
        resources: { Food: 3, Labor: 2 },
        hasPlacedWorkerThisTurn: true,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("untap");
    expect(result.activeSide).toBe("opponent");
    expect(result.turn).toBe(1); // same round — the opponent hasn't gone yet
    expect(result.player.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.player.hasPlacedWorkerThisTurn).toBe(false);
    // Still tapped — it's the opponent's turn now, not the player's next
    // one, so nothing should have untapped the player's lane yet.
    expect(result.player.lane[0].tapped).toBe(true);
  });

  it("End starts a new round, back at the first side, once the second side finishes", () => {
    const state = stateWith({
      phase: "end",
      turn: 1,
      firstSide: "player",
      activeSide: "opponent",
      opponent: {
        lane: [card("builder", "ol1", true)],
        resources: { Food: 1, Labor: 4 },
        hasPlacedWorkerThisTurn: true,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("untap");
    expect(result.activeSide).toBe("player");
    expect(result.turn).toBe(2); // round complete — a new one begins
    expect(result.opponent.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.opponent.hasPlacedWorkerThisTurn).toBe(false);
    // Still tapped until the opponent's own next Untap phase resolves.
    expect(result.opponent.lane[0].tapped).toBe(true);
  });
});

describe("RESTART", () => {
  it("produces a fresh game from any state, including game over", () => {
    const gameOverState = stateWith({ gameOver: true, turn: 5, phase: "upkeep" });
    const result = gameReducer(gameOverState, { type: "RESTART" });
    expect(result.gameOver).toBe(false);
    expect(result.turn).toBe(1);
    expect(result.phase).toBe("coinToss");
    expect(result.player.hand).toHaveLength(7);
    expect(result.activeSide).toBe(result.firstSide); // a fresh coin toss, not leftover state
  });
});

describe("TURN_PHASES-driven behavior", () => {
  it("nextLabel text always names a phase that is actually active", () => {
    // Guards against exactly the bug that prompted this rewrite: a "Next"
    // button whose label promises a phase the loop doesn't actually visit.
    const state = stateWith({ phase: "main", player: { lane: [], resources: { Food: 0, Labor: 0 } } });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("warfare"); // Upkeep is absent, so Main must skip it
  });
});
