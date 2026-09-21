import { useReducer, useState } from "react";
import { gameReducer, setupGame } from "../game/engine";
import { CardView } from "./CardView";
import { PileView } from "./PileView";
import { HandFan } from "./HandFan";
import { MulliganOverlay } from "./MulliganOverlay";

interface GameBoardProps {
  onExitToMenu: () => void;
}

export function GameBoard({ onExitToMenu }: GameBoardProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, setupGame);
  const [logOpen, setLogOpen] = useState(false);
  const { player, phase, turn, pendingSacrifices, log, gameOver } = state;
  const population = player.lane.length;
  const topGraveyardCard = player.graveyard[player.graveyard.length - 1];

  return (
    <div className="board">
      <header className="hud">
        <div className="hud__title">Poly Cards — v0</div>
        <div className="hud__stats">
          <span>
            Turn {turn} · <strong className="hud__phase">{phase.toUpperCase()}</strong>
          </span>
          <span>Population {population}</span>
          <span>🌾 {player.resources.Food}</span>
          <span>🔨 {player.resources.Labor}</span>
        </div>
        <div className="hud__actions">
          <button className="chip-btn" onClick={onExitToMenu}>
            Menu
          </button>
          <button className="chip-btn" onClick={() => setLogOpen((v) => !v)}>
            Log
          </button>
        </div>
      </header>

      {logOpen && (
        <aside className="log-panel">
          <ul>
            {log
              .slice()
              .reverse()
              .map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
          </ul>
        </aside>
      )}

      {phase === "upkeep" && !gameOver && (
        <div className="upkeep-banner">
          Short {pendingSacrifices} Food — click {pendingSacrifices} Worker(s) in the
          lane to sacrifice.
        </div>
      )}

      <div className="playfield">
        <div className="side-piles">
          <PileView
            kind="graveyard"
            count={player.graveyard.length}
            topLabel={topGraveyardCard?.kind}
          />
          <PileView kind="deck" count={player.deck.length} />
        </div>

        <div className="lane">
          {player.lane.length === 0 && <p className="empty">No Workers in play.</p>}
          {player.lane.map((card) => {
            const inUpkeep = phase === "upkeep" && pendingSacrifices > 0;
            const canTap = phase === "main" && !card.tapped;
            const onClick = inUpkeep
              ? () => dispatch({ type: "SACRIFICE_WORKER", instanceId: card.instanceId })
              : canTap
              ? () => dispatch({ type: "TAP_WORKER", instanceId: card.instanceId })
              : undefined;

            return (
              <CardView
                key={card.instanceId}
                card={card}
                variant="lane"
                onClick={onClick}
                highlight={inUpkeep}
                actionLabel={inUpkeep ? "Sacrifice" : canTap ? "Tap" : undefined}
              />
            );
          })}
        </div>

        {phase === "draw" && (
          <button className="phase-btn" onClick={() => dispatch({ type: "DRAW_CARD" })}>
            Next
            <span>Draw</span>
          </button>
        )}
        {phase === "main" && (
          <button className="phase-btn" onClick={() => dispatch({ type: "END_MAIN_PHASE" })}>
            Next
            <span>To Upkeep</span>
          </button>
        )}
        {phase === "warfare" && (
          <button className="phase-btn" onClick={() => dispatch({ type: "END_WARFARE_PHASE" })}>
            Next
            <span>To End</span>
          </button>
        )}
        {phase === "end" && (
          <button className="phase-btn" onClick={() => dispatch({ type: "END_TURN" })}>
            Next
            <span>End Turn</span>
          </button>
        )}
      </div>

      <div className="hand-tray">
        <HandFan
          cards={player.hand}
          actionLabel="Place"
          onCardClick={
            phase === "main" && !player.hasPlacedWorkerThisTurn
              ? (instanceId) => dispatch({ type: "PLACE_WORKER", instanceId })
              : undefined
          }
        />
      </div>

      {phase === "mulligan" && (
        <MulliganOverlay
          hand={player.hand}
          onConfirm={() => dispatch({ type: "CONFIRM_MULLIGAN" })}
          onFinish={() => dispatch({ type: "FINISH_MULLIGAN" })}
        />
      )}

      {gameOver && (
        <div className="overlay">
          <div className="overlay__card">
            <h2>Game Over</h2>
            <p>Your population collapsed to 0.</p>
            <div className="overlay__actions">
              <button onClick={() => dispatch({ type: "RESTART" })}>Restart</button>
              <button className="overlay__secondary" onClick={onExitToMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
