import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragCancelEvent, DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
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

/** Is `point` inside `rect`? Takes anything DOMRect-shaped
 *  (top/left/right/bottom) — a real DOMRect or dnd-kit's own rect type
 *  both qualify. */
function pointInRect(
  point: { x: number; y: number },
  rect: { top: number; left: number; right: number; bottom: number },
): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Every state a hand-card drag can be in, and the only actions that move
 *  between them. The explicit alternative to loose, independently-settable
 *  booleans (a bare `draggingId` + `isOverLane` pair can drift out of sync
 *  — nothing stops "over the lane" from reading true while nothing is
 *  actually being dragged). Here "over the lane" only exists as a field of
 *  the "dragging" state, so that combination is simply unrepresentable.
 *  There's no fourth state for "dropped outside the lane": that's not a
 *  distinct state to land in, it's just "end" from "dragging" where the
 *  caller (see handleDragEnd) finds overLane false and skips placing —
 *  the card was always still in the hand, so "returning" it is just not
 *  moving it, the same as any other invalid click already did.
 *
 *  `dropIndex` is a separate field from `overLane`, not derived from it:
 *  it's only meaningful while the freeWorkerPlacement modifier is on (see
 *  PLACE_WORKER), so it can be null while overLane is true (modifier off,
 *  or off the edge of any measured card) without that meaning "not over
 *  the lane" — the lane highlight and the ghost slot are genuinely two
 *  different questions that happen to update together. */
type DragState =
  | { status: "idle" }
  | { status: "dragging"; cardId: string; overLane: boolean; dropIndex: number | null };

type DragAction =
  | { type: "start"; cardId: string }
  | { type: "move"; overLane: boolean; dropIndex: number | null }
  | { type: "end" };

const IDLE_DRAG_STATE: DragState = { status: "idle" };

function dragStateReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case "start":
      return { status: "dragging", cardId: action.cardId, overLane: false, dropIndex: null };
    case "move":
      // No-op from "idle" — a stray move event can't un-idle a drag that
      // never started.
      return state.status === "dragging"
        ? { ...state, overLane: action.overLane, dropIndex: action.dropIndex }
        : state;
    case "end":
      return IDLE_DRAG_STATE;
  }
}

interface GameBoardProps {
  onExitToMenu: () => void;
}

export function GameBoard({ onExitToMenu }: GameBoardProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, setupGame);
  const [logOpen, setLogOpen] = useState(false);
  const [drawingCard, setDrawingCard] = useState<CardInstance | null>(null);
  const [dragState, dispatchDrag] = useReducer(dragStateReducer, IDLE_DRAG_STATE);
  const { player, opponent, phase, turn, pendingSacrifices, log, gameOver } = state;
  const topGraveyardCard = player.graveyard[player.graveyard.length - 1];
  const topOpponentGraveyardCard = opponent.graveyard[opponent.graveyard.length - 1];
  const canPlaceWorker = phase === "main" && !player.hasPlacedWorkerThisTurn;
  const draggingCard =
    dragState.status === "dragging"
      ? player.hand.find((c) => c.instanceId === dragState.cardId)
      : undefined;
  const isOverLane = dragState.status === "dragging" && dragState.overLane;
  const dropIndex = dragState.status === "dragging" ? dragState.dropIndex : null;
  // The visible lane box (the dark rounded zone, sized to its actual
  // content) — deliberately not .lane__tokens, the big invisible flex
  // container it sits in: that spans most of the row's width, so testing
  // against it would count the drag as "over the lane" anywhere near it,
  // not just while actually touching the dark zone. Also used by the FLIP
  // effect below to measure lane token positions.
  const laneZoneRef = useRef<HTMLDivElement>(null);
  // One DOM node per card currently in the player's lane, keyed by
  // instanceId — measured live during a drag to work out which slot the
  // cursor is over (see computeDropIndex). Populated/cleared by each
  // lane__slot wrapper's ref callback below, so it never goes stale: an
  // entry only exists while its card is actually mounted.
  const laneCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  function registerLaneCardRef(id: string, el: HTMLElement | null) {
    if (el) laneCardRefs.current.set(id, el);
    else laneCardRefs.current.delete(id);
  }
  // Where the flying card renders — tracked by hand instead of via
  // dnd-kit's <DragOverlay> positioning (which is driven by measuring the
  // *original* card's rect and translating from there). That's a real
  // element-size measurement, which this environment has repeatedly
  // gotten wrong in small, inconsistent ways throughout this feature
  // (see isOverLaneRect's own comment) — including, it turns out, when
  // used to keep the overlay centered on the cursor. `delta` (below)
  // is not a measurement at all, just dnd-kit's own running total of
  // raw pointer movement, so it can't be thrown off the same way.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // A short activation distance so a plain click/tap still registers as a
  // click (see HandFan's onClick) instead of always starting a drag — only
  // a real, deliberate drag past that threshold takes over.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handlePlaceWorker(instanceId: string) {
    dispatch({ type: "PLACE_WORKER", instanceId });
  }

  // dnd-kit's own droppable/collision system (useDroppable + event.over)
  // never got its first rect measurement in this setup — its "am I over a
  // droppable" answer stayed permanently null through an entire drag no
  // matter the measuring strategy, so nothing ever counted as a valid
  // drop. So this is checked by hand instead — but not by overlapping the
  // *original hand card's* rect (event.active.rect.current.translated):
  // that's the source card's own size (~170x220px, much bigger than the
  // floating token the user actually sees) translated by raw pointer
  // delta, which isn't centered under the cursor the way the visible
  // token is. Testing that oversized, off-center rect against the lane
  // is what caused the lane to light up while nowhere near it (e.g.
  // hovering below the deck pile) — a large box overlapping the lane
  // doesn't mean the small token you can actually see does. The pointer
  // itself is what the floating token is centered on (see cursorPos), so
  // testing that single point against the lane matches what's on screen.
  function isOverLaneRect(event: DragMoveEvent | DragEndEvent): boolean {
    const pointer = pointerPositionFor(event);
    const laneEl = laneZoneRef.current;
    if (!pointer || !laneEl) return false;
    return pointInRect(pointer, laneEl.getBoundingClientRect());
  }

  // Which slot in the lane a horizontal pointer position falls into, i.e.
  // the sortable-list "where would this be inserted" question: walk the
  // lane in order and stop at the first card whose center the pointer is
  // still left of — that's the index to insert before. Past the last
  // card's center, it goes at the end. Only meaningful while
  // freeWorkerPlacement is on (see PLACE_WORKER) and the pointer is over
  // the lane at all — callers gate on both.
  function computeDropIndex(pointerX: number): number {
    for (let i = 0; i < player.lane.length; i++) {
      const el = laneCardRefs.current.get(player.lane[i].instanceId);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (pointerX < rect.left + rect.width / 2) return i;
    }
    return player.lane.length;
  }

  // dropIndex only has an opinion while the modifier is on and there's a
  // pointer reading to test it against — see DragState's own comment for
  // why this is deliberately independent from "is it over the lane at
  // all" (overLane, computed by the caller from isOverLaneRect directly).
  function dropIndexFor(overLane: boolean, pointer: { x: number; y: number } | null): number | null {
    if (!overLane || !state.modifiers.freeWorkerPlacement || !pointer) return null;
    return computeDropIndex(pointer.x);
  }

  // Current pointer position = where the drag started (a plain read of
  // the native event's own clientX/Y, not a measurement) plus dnd-kit's
  // own running total of pointer movement since then. See cursorPos's
  // definition above for why this, and not any rect-based approach, is
  // what actually positions the flying card.
  function pointerPositionFor(event: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
    const start = getEventCoordinates(event.activatorEvent);
    if (!start) return null;
    return { x: start.x + event.delta.x, y: start.y + event.delta.y };
  }

  function handleDragStart(event: DragStartEvent) {
    dispatchDrag({ type: "start", cardId: String(event.active.id) });
    const start = getEventCoordinates(event.activatorEvent);
    if (start) setCursorPos(start);
  }

  function handleDragMove(event: DragMoveEvent) {
    // Gated on canPlaceWorker too, not just the rect overlap: a card can be
    // dragged any time (see HandFan), but if this drop couldn't actually
    // place it (wrong phase, already placed one this turn), the lane
    // shouldn't light up or offer a slot for it — that visual feedback is
    // a promise the drop can keep, not just "you're near the lane".
    const overLane = canPlaceWorker && isOverLaneRect(event);
    const pointer = pointerPositionFor(event);
    dispatchDrag({ type: "move", overLane, dropIndex: dropIndexFor(overLane, pointer) });
    setCursorPos(pointer);
  }

  function handleDragEnd(event: DragEndEvent) {
    // Read where it landed before "end" wipes the drag state, not after —
    // once it's "idle" there's no longer a dragged card to have an
    // opinion about. Dropped anywhere but the lane (including nowhere at
    // all) is simply not a placement, the same as an invalid click was
    // already a no-op: the card never left the hand, so there's nothing
    // to undo.
    const droppedOnLane = canPlaceWorker && isOverLaneRect(event);
    const index = dropIndexFor(droppedOnLane, pointerPositionFor(event)) ?? undefined;
    dispatchDrag({ type: "end" });
    setCursorPos(null);
    if (droppedOnLane) {
      dispatch({ type: "PLACE_WORKER", instanceId: String(event.active.id), index });
    }
  }

  // dnd-kit also fires this — a sensor-level abort (e.g. Escape) rather
  // than a normal pointerup — for a drag that was never "end"ed. Without
  // handling it too, that's a real gap in "what actions can happen from
  // the dragging state": the reducer would just sit in "dragging"
  // forever, leaving the source card dimmed with no way back.
  function handleDragCancel(_event: DragCancelEvent) {
    dispatchDrag({ type: "end" });
    setCursorPos(null);
  }

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

  // The player's lane, with a ghost slot spliced in at dropIndex while a
  // free-placement drag hovers a specific gap — "id" doubles as each
  // .lane__slot wrapper's key and FLIP identity (see the effect below);
  // "ghost" only ever appears once, so its own id needs no card behind it.
  type LaneItem = { id: string; kind: "card"; card: CardInstance } | { id: "ghost"; kind: "ghost" };
  const laneItems: LaneItem[] = [];
  if (dropIndex !== null) {
    player.lane.forEach((card, i) => {
      if (i === dropIndex) laneItems.push({ id: "ghost", kind: "ghost" });
      laneItems.push({ id: card.instanceId, kind: "card", card });
    });
    if (dropIndex >= player.lane.length) laneItems.push({ id: "ghost", kind: "ghost" });
  } else {
    player.lane.forEach((card) => laneItems.push({ id: card.instanceId, kind: "card", card }));
  }

  // FLIP (First-Last-Invert-Play): plain flexbox reflow when a ghost slot
  // is inserted/moves is an instant jump, not a slide — browsers don't
  // animate layout changes on their own. So each render, before painting,
  // capture where every .lane__slot wrapper ends up, compare it to where
  // it was last time, and if a card moved, snap it back there with a
  // transform and immediately transition that transform to zero. Runs off
  // `laneItems`' own identities (the id list) so it only does this work
  // when the lane's order/contents actually changed, not on every render.
  const prevLaneRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const laneItemsKey = laneItems.map((item) => item.id).join(",");

  useLayoutEffect(() => {
    const container = laneZoneRef.current;
    const prevRects = prevLaneRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    if (container) {
      for (const child of Array.from(container.children) as HTMLElement[]) {
        const id = child.dataset.flipId;
        if (!id) continue;
        const rect = child.getBoundingClientRect();
        nextRects.set(id, rect);
        const prevRect = prevRects.get(id);
        if (prevRect && prevRect.left !== rect.left) {
          const dx = prevRect.left - rect.left;
          child.style.transition = "none";
          child.style.transform = `translateX(${dx}px)`;
          // Force the browser to apply that transform before switching
          // transitions back on, otherwise it'd just see the end state
          // and skip straight to it instead of animating from dx to 0.
          child.getBoundingClientRect();
          child.style.transition = "transform 0.18s ease";
          child.style.transform = "";
        }
      }
    }
    prevLaneRectsRef.current = nextRects;
    // laneItemsKey is the real dependency (it changes exactly when a
    // slot's position could have); laneItems itself is a fresh array every
    // render and would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneItemsKey]);

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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
              <div className={`lane__tokens ${isOverLane ? "lane__tokens--drop-active" : ""}`}>
                <div className="lane__zone" ref={laneZoneRef}>
                  {laneItems.length > 0 ? (
                    laneItems.map((item) => {
                      if (item.kind === "ghost") {
                        // An empty lane already shows a full-size ghost
                        // outline at rest (the .lane__ghost fallback below)
                        // — swapping that for this same-looking slot should
                        // read as "it was already there", not as a fresh
                        // grow-in. Only actually animate the grow when
                        // there's real lane content to make room in.
                        const wasAlreadyEmpty = player.lane.length === 0;
                        return (
                          <div key="ghost" className="lane__slot" data-flip-id="ghost">
                            <div
                              className={`card--ghost-slot ${wasAlreadyEmpty ? "card--ghost-slot--static" : ""}`}
                            />
                          </div>
                        );
                      }

                      const { card } = item;
                      const inUpkeep = phase === "upkeep" && pendingSacrifices > 0;
                      const canTap = phase === "main" && !card.tapped;
                      const onClick = inUpkeep
                        ? () => dispatch({ type: "SACRIFICE_WORKER", instanceId: card.instanceId })
                        : canTap
                        ? () => dispatch({ type: "TAP_WORKER", instanceId: card.instanceId })
                        : undefined;

                      return (
                        <div
                          key={card.instanceId}
                          className="lane__slot"
                          data-flip-id={card.instanceId}
                          ref={(el) => registerLaneCardRef(card.instanceId, el)}
                        >
                          <CardView card={card} variant="lane" onClick={onClick} highlight={inUpkeep} />
                        </div>
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
              onCardClick={canPlaceWorker ? handlePlaceWorker : undefined}
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

      {/* The "flying" copy that actually follows the cursor while
          dragging — the card back in the hand just dims (see
          HandFan/HandFanCard) rather than moving itself. Rendered as the
          lane token look (name, art, resource badge — no rules text),
          same size a token gets once placed, since that's what dropping
          it actually produces — previewing the full "Normal" card here
          would show detail the drop itself won't give you. noPreview
          skips the token variant's usual hover-preview popup, which
          would otherwise trigger constantly (this tracks the cursor
          everywhere, so it's always "hovered").

          Positioned by hand (left/top at cursorPos, centered via the
          transform) instead of via <DragOverlay> — see cursorPos's own
          definition for why. translate(-50%,-50%) needs no size
          measurement at all to center the card on the cursor, unlike
          dnd-kit's own positioning system. */}
      {draggingCard && cursorPos && (
        <div
          style={
            {
              position: "fixed",
              left: cursorPos.x,
              top: cursorPos.y,
              transform: "translate(-50%, -50%)",
              zIndex: 1000,
              pointerEvents: "none",
              cursor: "grabbing",
            } as CSSProperties
          }
        >
          <CardView card={draggingCard} variant="lane" noPreview />
        </div>
      )}
      </DndContext>
    </HandTuningProvider>
  );
}
