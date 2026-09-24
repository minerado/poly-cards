import { buildStarterDeck } from "./cards";
import { draw } from "./helpers";
import type { GameState, PlayerState, Side } from "./types";

const STARTING_HAND_SIZE = 7;

/** A fair coin toss for who takes the first turn. Exported so tests can
 *  exercise both outcomes deterministically by mocking Math.random. */
export function coinToss(): Side {
  return Math.random() < 0.5 ? "player" : "opponent";
}

/** A fresh, independently-shuffled deck with a starting hand dealt from it. */
function dealFreshHand(): PlayerState {
  const fullDeck = buildStarterDeck();
  const [hand, deck] = draw(fullDeck, STARTING_HAND_SIZE);

  return {
    deck,
    hand,
    lane: [],
    graveyard: [],
    resources: { Food: 0, Labor: 0 },
    hasPlacedWorkerThisTurn: false,
    hasDraftedThisTurn: false,
  };
}

export function setupGame(): GameState {
  const player = dealFreshHand();
  // The opponent's own deck, dealt the same way — not a copy or a mirror of
  // the player's, a genuinely separate shuffle (see buildStarterDeck).
  const opponent = dealFreshHand();
  const firstSide = coinToss();

  return {
    turn: 1,
    phase: "coinToss",
    activeSide: firstSide,
    firstSide,
    // freeWorkerPlacement is on unconditionally for now — no card grants it
    // yet (see Rules/Placement Modifiers.md), this is just switching it on
    // directly in game state to build and observe the drag-to-position UI.
    modifiers: { freeWorkerPlacement: true },
    player,
    opponent,
    pendingSacrifices: 0,
    log: [
      `Game start: drew a ${STARTING_HAND_SIZE}-card hand.`,
      firstSide === "player" ? "Coin toss: you go first." : "Coin toss: the opponent goes first.",
      "Mulligan: shuffle your whole hand back and draw one fewer, or keep it.",
    ],
    gameOver: false,
  };
}
