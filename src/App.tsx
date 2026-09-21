import { useState } from "react";
import { MainMenu } from "./components/MainMenu";
import { GameBoard } from "./components/GameBoard";

type Screen = "menu" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");

  if (screen === "game") {
    return <GameBoard onExitToMenu={() => setScreen("menu")} />;
  }
  return <MainMenu onPlay={() => setScreen("game")} />;
}
