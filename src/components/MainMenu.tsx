import type { Difficulty } from "../game/types";

interface MainMenuProps {
  onPlay: () => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
}

// Display order only — deliberately not Difficulty's own declaration
// order in game/types.ts, where "dumb" comes first as a nod to it being
// the original opponent. Here it reads as a normal difficulty ladder.
const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "dumb", label: "Dumb" },
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

export function MainMenu({ onPlay, difficulty, onDifficultyChange }: MainMenuProps) {
  return (
    <div className="menu-screen">
      <div className="menu-screen__version">v0</div>
      <div className="menu-screen__hills" />

      <div className="menu-screen__content">
        <div className="menu-screen__emblem">
          <div className="menu-screen__ring menu-screen__ring--outer" />
          <div className="menu-screen__ring menu-screen__ring--inner" />

          <h1 className="menu-screen__title">Poly Cards</h1>
          <p className="menu-screen__tagline">Build a civilization, one Worker at a time.</p>

          <div className="menu-screen__difficulty" role="radiogroup" aria-label="Opponent difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={difficulty === d.value}
                className={`menu-screen__difficulty-item ${
                  difficulty === d.value ? "menu-screen__difficulty-item--selected" : ""
                }`}
                onClick={() => onDifficultyChange(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <nav className="menu-screen__nav">
            <button className="menu-screen__item menu-screen__item--primary" onClick={onPlay}>
              Play
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
