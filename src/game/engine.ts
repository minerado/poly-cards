import { CARD_DEFINITIONS, buildStarterDeck, shuffle } from "./cards";
import type { CardInstance, GameState, PlayerState } from "./types";

const STARTING_HAND_SIZE = 7;

function draw(deck: CardInstance[], count: number): [CardInstance[], CardInstance[]] {
  const drawn = deck.slice(0, count);
  const rest = deck.slice(count);
  return [drawn, rest];
}

export function setupGame(): GameState {
  const fullDeck = buildStarterDeck();
  const [hand, deck] = draw(fullDeck, STARTING_HAND_SIZE);

  const player: PlayerState = {
    deck,
    hand,
    lane: [],
    graveyard: [],
    resources: { Food: 0, Labor: 0 },
    hasPlacedWorkerThisTurn: false,
  };

  return {
    turn: 1,
    phase: "mulligan",
    player,
    pendingSacrifices: 0,
    log: [
      `Game start: drew a ${STARTING_HAND_SIZE}-card hand.`,
      "Turn order decided: you go first.",
      "Mulligan: shuffle your whole hand back and draw one fewer, or keep it.",
    ],
    gameOver: false,
  };
}

export type Action =
  | { type: "CONFIRM_MULLIGAN" }
  | { type: "FINISH_MULLIGAN" }
  | { type: "DRAW_CARD" }
  | { type: "PLACE_WORKER"; instanceId: string }
  | { type: "TAP_WORKER"; instanceId: string }
  | { type: "END_MAIN_PHASE" }
  | { type: "SACRIFICE_WORKER"; instanceId: string }
  | { type: "END_WARFARE_PHASE" }
  | { type: "END_TURN" }
  | { type: "RESTART" };

function withLog(state: GameState, message: string): GameState {
  return { ...state, log: [...state.log, message] };
}

export function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "RESTART") return setupGame();
  if (state.gameOver) return state;

  switch (action.type) {
    case "CONFIRM_MULLIGAN": {
      if (state.phase !== "mulligan") return state;
      // Can't mulligan a 1-card hand — nothing left to shrink to.
      if (state.player.hand.length <= 1) return state;

      const discarded = state.player.hand;
      const keepCount = discarded.length - 1;
      const [hand, deck] = draw(shuffle([...state.player.deck, ...discarded]), keepCount);
      const player: PlayerState = { ...state.player, deck, hand };

      // Stays in "mulligan" — the player is asked again whether they're
      // satisfied, and can keep mulliganing (one fewer card each time) down
      // to a 1-card hand.
      return withLog(
        { ...state, player },
        `Mulligan: shuffled ${discarded.length} cards back into the deck, drew a new hand of ${hand.length}.`
      );
    }

    case "FINISH_MULLIGAN": {
      if (state.phase !== "mulligan") return state;
      return withLog(
        { ...state, phase: "draw" },
        "Mulligan: kept this hand. Turn 1 — Draw phase."
      );
    }

    case "DRAW_CARD": {
      if (state.phase !== "draw") return state;
      const [drawn, deck] = draw(state.player.deck, 1);
      const player: PlayerState = { ...state.player, deck, hand: [...state.player.hand, ...drawn] };
      return withLog(
        { ...state, player, phase: "main" },
        drawn.length > 0 ? `Drew ${drawn[0].kind}.` : "Deck is empty, no card drawn."
      );
    }

    case "PLACE_WORKER": {
      if (state.phase !== "main" || state.player.hasPlacedWorkerThisTurn) return state;
      const card = state.player.hand.find((c) => c.instanceId === action.instanceId);
      if (!card) return state;

      const player: PlayerState = {
        ...state.player,
        hand: state.player.hand.filter((c) => c.instanceId !== action.instanceId),
        lane: [...state.player.lane, card],
        hasPlacedWorkerThisTurn: true,
      };
      return withLog({ ...state, player }, `Placed ${card.kind} into the lane.`);
    }

    case "TAP_WORKER": {
      if (state.phase !== "main") return state;
      const card = state.player.lane.find((c) => c.instanceId === action.instanceId);
      if (!card || card.tapped) return state;

      const def = CARD_DEFINITIONS[card.kind];
      const player: PlayerState = {
        ...state.player,
        lane: state.player.lane.map((c) =>
          c.instanceId === action.instanceId ? { ...c, tapped: true } : c
        ),
        resources: {
          ...state.player.resources,
          [def.generates]: state.player.resources[def.generates] + def.amount,
        },
      };
      return withLog(
        { ...state, player },
        `Tapped ${card.kind} for ${def.amount} ${def.generates}.`
      );
    }

    case "END_MAIN_PHASE": {
      if (state.phase !== "main") return state;
      const population = state.player.lane.length;
      const food = state.player.resources.Food;
      const deficit = Math.max(0, population - food);

      if (deficit === 0) {
        return withLog(
          { ...state, phase: "warfare" },
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

    case "SACRIFICE_WORKER": {
      if (state.phase !== "upkeep" || state.pendingSacrifices <= 0) return state;
      const card = state.player.lane.find((c) => c.instanceId === action.instanceId);
      if (!card) return state;

      const lane = state.player.lane.filter((c) => c.instanceId !== action.instanceId);
      const pendingSacrifices = state.pendingSacrifices - 1;
      const player: PlayerState = {
        ...state.player,
        lane,
        graveyard: [...state.player.graveyard, card],
      };

      let next: GameState = withLog(
        { ...state, player, pendingSacrifices },
        `Sacrificed ${card.kind}.`
      );

      if (lane.length === 0) {
        return withLog(
          { ...next, gameOver: true },
          "Population has collapsed. Game over."
        );
      }
      if (pendingSacrifices === 0) {
        next = withLog({ ...next, phase: "warfare" }, "Upkeep satisfied.");
      }
      return next;
    }

    case "END_WARFARE_PHASE": {
      if (state.phase !== "warfare") return state;
      return withLog({ ...state, phase: "end" }, "Warfare: no conflicts yet.");
    }

    case "END_TURN": {
      if (state.phase !== "end") return state;
      const player: PlayerState = {
        ...state.player,
        lane: state.player.lane.map((c) => ({ ...c, tapped: false })),
        resources: { Food: 0, Labor: 0 },
        hasPlacedWorkerThisTurn: false,
      };
      const turn = state.turn + 1;
      return withLog(
        { ...state, player, turn, phase: "draw" },
        `Turn ${turn} — Draw phase.`
      );
    }

    default:
      return state;
  }
}
