import { buildStarterDeck } from "./cards";
import { draw } from "./helpers";
import type { GameState, PlayerState } from "./types";

const STARTING_HAND_SIZE = 7;

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
