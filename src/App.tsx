import { useState } from "react";
import { MainMenu } from "./components/MainMenu";
import { GameBoard } from "./components/GameBoard";
import type { Difficulty } from "./game/types";

type Screen = "menu" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  // Chosen on the menu, carried into GameBoard's own setupGame call — see
  // GameBoard's difficulty prop. Kept here (not inside GameBoard) so it
  // survives GameBoard unmounting on "Main Menu" and can be changed before
  // the next Play.
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  if (screen === "game") {
    return <GameBoard difficulty={difficulty} onExitToMenu={() => setScreen("menu")} />;
  }
  return (
    <MainMenu
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      onPlay={() => setScreen("game")}
    />
  );
}
