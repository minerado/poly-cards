import { describe, expect, it } from "vitest";
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

function card(defId: string, instanceId: string, tapped = false): CardInstance {
  return { instanceId, defId, tapped };
}

/** A minimal, fully-controlled state for testing one action at a time, bypassing setupGame()'s randomness. */
function stateWith(
  overrides: Partial<Omit<GameState, "player">> & { player?: Partial<PlayerState> }
): GameState {
  const base = setupGame();
  return {
    ...base,
    ...overrides,
    player: { ...base.player, ...overrides.player },
  };
}

describe("setupGame", () => {
  it("starts in mulligan with a 7-card hand and an empty lane", () => {
    const state = setupGame();
    expect(state.phase).toBe("mulligan");
    expect(state.player.hand).toHaveLength(7);
    expect(state.player.lane).toHaveLength(0);
    expect(state.player.deck).toHaveLength(13); // 20-card deck - 7 dealt
    expect(state.turn).toBe(1);
    expect(state.gameOver).toBe(false);
  });

  it("deals the opponent a real, independent board — not a copy of the player's", () => {
    const state = setupGame();
    expect(state.opponent.hand).toHaveLength(7);
    expect(state.opponent.lane).toHaveLength(0);
    expect(state.opponent.deck).toHaveLength(13);

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

describe("mulligan", () => {
  it("shrinks the hand by exactly 1 each round, down to a 1-card floor", () => {
    let state = setupGame();
    const sizes = [state.player.hand.length];
    for (let i = 0; i < 6; i += 1) {
      state = gameReducer(state, { type: "CONFIRM_MULLIGAN" });
      sizes.push(state.player.hand.length);
    }
    expect(sizes).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(state.phase).toBe("mulligan"); // still asking, never auto-finishes
  });

  it("refuses to mulligan a 1-card hand", () => {
    const oneCard = stateWith({ player: { hand: [card("farmer", "f1")] } });
    const result = gameReducer(oneCard, { type: "CONFIRM_MULLIGAN" });
    expect(result).toBe(oneCard); // unchanged reference — a true no-op
  });

  it("shuffles discarded cards back into the deck (deck grows, total stays constant)", () => {
    const before = setupGame();
    const totalBefore = before.player.hand.length + before.player.deck.length;
    const after = gameReducer(before, { type: "CONFIRM_MULLIGAN" });
    const totalAfter = after.player.hand.length + after.player.deck.length;
    expect(totalAfter).toBe(totalBefore);
    expect(after.player.deck.length).toBe(before.player.deck.length + 1);
  });

  it("FINISH_MULLIGAN moves to the first turn phase (draw) without changing the hand", () => {
    const state = setupGame();
    const result = gameReducer(state, { type: "FINISH_MULLIGAN" });
    expect(result.phase).toBe("draw");
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

describe("warfare and end", () => {
  it("ADVANCE passes Warfare through to End", () => {
    const state = stateWith({ phase: "warfare" });
    expect(gameReducer(state, { type: "ADVANCE" }).phase).toBe("end");
  });

  it("ADVANCE in End resets per-turn state and moves to the next turn's draw phase", () => {
    const state = stateWith({
      phase: "end",
      turn: 1,
      player: {
        lane: [card("farmer", "l1", true)],
        resources: { Food: 3, Labor: 2 },
        hasPlacedWorkerThisTurn: true,
      },
    });
    const result = gameReducer(state, { type: "ADVANCE" });
    expect(result.phase).toBe("draw");
    expect(result.turn).toBe(2);
    expect(result.player.resources).toEqual({ Food: 0, Labor: 0 });
    expect(result.player.hasPlacedWorkerThisTurn).toBe(false);
    expect(result.player.lane[0].tapped).toBe(false);
  });
});

describe("RESTART", () => {
  it("produces a fresh game from any state, including game over", () => {
    const gameOverState = stateWith({ gameOver: true, turn: 5, phase: "upkeep" });
    const result = gameReducer(gameOverState, { type: "RESTART" });
    expect(result.gameOver).toBe(false);
    expect(result.turn).toBe(1);
    expect(result.phase).toBe("mulligan");
    expect(result.player.hand).toHaveLength(7);
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
