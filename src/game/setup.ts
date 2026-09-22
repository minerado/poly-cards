import { buildStarterDeck } from "./cards";
import { draw } from "./helpers";
import type { GameState, PlayerState } from "./types";

const STARTING_HAND_SIZE = 7;

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
  };
}

export function setupGame(): GameState {
  const player = dealFreshHand();
  // The opponent's own deck, dealt the same way — not a copy or a mirror of
  // the player's, a genuinely separate shuffle (see buildStarterDeck).
  const opponent = dealFreshHand();

  return {
    turn: 1,
    phase: "mulligan",
    // freeWorkerPlacement is on unconditionally for now — no card grants it
    // yet (see Rules/Placement Modifiers.md), this is just switching it on
    // directly in game state to build and observe the drag-to-position UI.
    modifiers: { freeWorkerPlacement: true },
    player,
    opponent,
    pendingSacrifices: 0,
    log: [
      `Game start: drew a ${STARTING_HAND_SIZE}-card hand.`,
      "Turn order decided: you go first.",
      "Mulligan: shuffle your whole hand back and draw one fewer, or keep it.",
    ],
    gameOver: false,
  };
}
