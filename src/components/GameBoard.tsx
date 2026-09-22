import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Menu, ScrollText } from "lucide-react";
import { definitionOf } from "../game/components/queries";
import { findPhaseDef, gameReducer, phaseCtx } from "../game/phases";
import { setupGame } from "../game/setup";
import type { CardInstance } from "../game/types";
import { CardView } from "./CardView";
import { DrawAnimation } from "./DrawAnimation";
import { PhaseNarrator } from "./PhaseNarrator";
import { PileView } from "./PileView";
import { FoodBadge, LaborBadge } from "./ResourceBadges";
import { HandFan } from "./HandFan";
import { MulliganOverlay } from "./MulliganOverlay";
import { HandTuningProvider } from "../dev/handTuning";
import { HandTuningPanel } from "../dev/HandTuningPanel";

interface GameBoardProps {
  onExitToMenu: () => void;
}

export function GameBoard({ onExitToMenu }: GameBoardProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, setupGame);
  const [logOpen, setLogOpen] = useState(false);
  const [drawingCard, setDrawingCard] = useState<CardInstance | null>(null);
  const { player, opponent, phase, turn, pendingSacrifices, log, gameOver } = state;
  const topGraveyardCard = player.graveyard[player.graveyard.length - 1];
  const topOpponentGraveyardCard = opponent.graveyard[opponent.graveyard.length - 1];

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
    <HandTuningProvider>
      <div className="board">
        <div className="corner corner--top-left">
          <div className="resource-chip">
            <FoodBadge /> {opponent.resources.Food}
          </div>
          <div className="resource-chip">
            <LaborBadge /> {opponent.resources.Labor}
          </div>
        </div>

        <div className="corner corner--top-center">
          <span className="turn-pill">
            Turn {turn} · <strong className="hud__phase">{phase.toUpperCase()}</strong>
          </span>
          {(() => {
            // The button's destination label comes from the active phase's
            // own definition (game/phases/*.ts), never hardcoded here — a
            // phase with no nextLabel (mulligan, upkeep) just renders no
            // button, since it advances through its own UI instead.
            const nextLabel = findPhaseDef(phase)?.nextLabel;
            if (!nextLabel) return null;
            const label =
              typeof nextLabel === "function" ? nextLabel(state, phaseCtx) : nextLabel;
            return (
              <button className="phase-btn" onClick={handleAdvance}>
                Next <span>{label}</span>
              </button>
            );
          })()}
        </div>

        <div className="corner corner--top-right">
          <button className="icon-btn" onClick={onExitToMenu} title="Menu">
            <Menu size={16} />
          </button>
          <button className="icon-btn" onClick={() => setLogOpen((v) => !v)} title="Log">
            <ScrollText size={16} />
          </button>
          <HandTuningPanel />
        </div>

        <div className="corner corner--bottom-right">
          <div className="resource-chip">
            <FoodBadge /> {player.resources.Food}
          </div>
          <div className="resource-chip">
            <LaborBadge /> {player.resources.Labor}
          </div>
        </div>

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

        {/* A wooden game-board surface sitting in the screen's center, behind
            the lanes but above the painted vista — see .wood-board for how
            it's sized to exactly fill the gap between the two
            fixed-height hand-trays regardless of viewport height. */}
        <div className="wood-board" />

        {/* The opponent's zone: same building blocks as the player's below,
            mirrored — hand-tray pins to the zone's top edge (column-reverse)
            and the playfield's own two rows mirror via --reversed
            (column-reverse again, so lane-row--main still ends up nearest
            the seam on both sides — see .playfield--reversed). Opponent
            doesn't take real turns yet (see GameState.opponent), so
            nothing here is clickable — it only ever renders whatever
            state hands it. */}
        <div className="zone zone--reversed">
          <div className="playfield playfield--reversed">
            <div className="lane-row lane-row--main">
              <PileView
                kind="graveyard"
                count={opponent.graveyard.length}
                topLabel={topOpponentGraveyardCard && definitionOf(topOpponentGraveyardCard).name}
              />
              <div className="lane__tokens lane__tokens--reversed">
                <div className="lane__zone lane__zone--reversed">
                  {opponent.lane.length > 0 ? (
                    opponent.lane.map((card) => (
                      <CardView key={card.instanceId} card={card} variant="lane" />
                    ))
                  ) : (
                    <div className="lane__ghost" />
                  )}
                  <ArrowLeft className="lane__arrow" size={18} />
                </div>
              </div>
              <PileView kind="deck" count={opponent.deck.length} />
            </div>
            {/* Reserved for future zones (a dedicated special-card slot,
                other playable cards) — deliberately empty for now. */}
            <div className="lane-row" />
          </div>

          <div className="hand-tray hand-tray--reversed">
            <HandFan cards={opponent.hand} faceDown reversed />
          </div>
        </div>

        {/* Live-tunable gap between the two zones — see .zone-gap and the
            "Distance between players" slider in the Wood board config. */}
        <div className="zone-gap" />

        <div className="zone">
          <div className="playfield">
            <div className="lane-row lane-row--main">
              <PileView kind="deck" count={player.deck.length} />
              <div className="lane__tokens">
                <div className="lane__zone">
                  {player.lane.length > 0 ? (
                    player.lane.map((card) => {
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
                        />
                      );
                    })
                  ) : (
                    <div className="lane__ghost" />
                  )}
                  <ArrowRight className="lane__arrow" size={18} />
                </div>
              </div>
              <PileView
                kind="graveyard"
                count={player.graveyard.length}
                topLabel={topGraveyardCard && definitionOf(topGraveyardCard).name}
              />
            </div>
            {/* Reserved for future zones (a dedicated special-card slot,
                other playable cards) — deliberately empty for now. */}
            <div className="lane-row" />
          </div>

          <div className="hand-tray">
            <HandFan
              cards={
                drawingCard
                  ? player.hand.filter((c) => c.instanceId !== drawingCard.instanceId)
                  : player.hand
              }
              onCardClick={
                phase === "main" && !player.hasPlacedWorkerThisTurn
                  ? (instanceId) => dispatch({ type: "PLACE_WORKER", instanceId })
                  : undefined
              }
            />
          </div>
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
    </HandTuningProvider>
  );
}
