import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { definitionOf } from "../game/components/queries";
import { findPhaseDef, gameReducer, phaseCtx } from "../game/phases";
import { setupGame } from "../game/setup";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";
import { DrawAnimation } from "./DrawAnimation";
import { PhaseNarrator } from "./PhaseNarrator";
import { PileView } from "./PileView";
import { HandFan } from "./HandFan";
import { MulliganOverlay } from "./MulliganOverlay";

interface GameBoardProps {
  onExitToMenu: () => void;
}

export function GameBoard({ onExitToMenu }: GameBoardProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, setupGame);
  const [logOpen, setLogOpen] = useState(false);
  const [drawingCard, setDrawingCard] = useState<CardInstance | null>(null);
  const { player, phase, turn, pendingSacrifices, log, gameOver } = state;
  const population = player.lane.length;
  const topGraveyardCard = player.graveyard[player.graveyard.length - 1];

  // Set right before dispatching a Draw-phase ADVANCE; consumed by the
  // layout effect below the moment the resulting `player.hand` lands, so
  // the newly drawn card can be identified and held back from the hand
  // fan until its flight animation finishes. Same pattern as
  // MulliganOverlay's pendingConfirmRef, for the same reason: reacting to
  // the actual prop change beats guessing with a timer.
  const pendingDrawRef = useRef<string[] | null>(null);

  useLayoutEffect(() => {
    const beforeIds = pendingDrawRef.current;
    if (!beforeIds) return;
    pendingDrawRef.current = null;
    const fresh = player.hand.find((c) => !beforeIds.includes(c.instanceId));
    if (fresh) setDrawingCard(fresh);
  }, [player.hand]);

  function handleAdvance() {
    if (phase === "draw") {
      pendingDrawRef.current = player.hand.map((c) => c.instanceId);
    }
    dispatch({ type: "ADVANCE" });
  }

  // Every phase change re-checks its own narrator config (game/phases/*.ts)
  // — this is the whole mechanism, no per-phase special-casing here. A
  // phase with `autoAdvance` gets nudged forward automatically once its
  // announcement has shown for `delayMs`; one without (Main's "Your Turn")
  // just fades on its own.
  const [narrator, setNarrator] = useState<{ message: string; delayMs: number } | null>(null);

  useEffect(() => {
    const def = findPhaseDef(phase)?.narrator;
    if (!def) {
      setNarrator(null);
      return;
    }
    setNarrator({ message: def.message, delayMs: def.delayMs });
    const t = setTimeout(() => {
      setNarrator(null);
      if (def.autoAdvance) handleAdvance();
    }, def.delayMs);
    return () => clearTimeout(t);
    // Intentionally re-runs only on phase change: nothing else can happen
    // mid-narrator, since these phases render no interactive UI.
  }, [phase]);

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
            topLabel={topGraveyardCard && definitionOf(topGraveyardCard).name}
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

        {(() => {
          // The button's destination label comes from the active phase's
          // own definition (game/phases/*.ts), never hardcoded here — a
          // phase with no nextLabel (mulligan, upkeep) just renders no
          // button, since it advances through its own UI instead.
          const nextLabel = findPhaseDef(phase)?.nextLabel;
          if (!nextLabel) return null;
          const label = typeof nextLabel === "function" ? nextLabel(state, phaseCtx) : nextLabel;
          return (
            <button className="phase-btn" onClick={handleAdvance}>
              Next
              <span>{label}</span>
            </button>
          );
        })()}
      </div>

      <div className="hand-tray">
        <HandFan
          cards={
            drawingCard
              ? player.hand.filter((c) => c.instanceId !== drawingCard.instanceId)
              : player.hand
          }
          actionLabel="Place"
          onCardClick={
            phase === "main" && !player.hasPlacedWorkerThisTurn
              ? (instanceId) => dispatch({ type: "PLACE_WORKER", instanceId })
              : undefined
          }
        />
      </div>

      {drawingCard && (
        <DrawAnimation card={drawingCard} onDone={() => setDrawingCard(null)} />
      )}

      {narrator && <PhaseNarrator message={narrator.message} durationMs={narrator.delayMs} />}

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
