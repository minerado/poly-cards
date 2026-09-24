import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragCancelEvent, DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Menu, ScrollText, Swords } from "lucide-react";
import { shouldOpponentAttack } from "../game/ai";
import {
  canAfford,
  costOf,
  definitionOf,
  hasWarfare,
  isAttachable,
  resourceGeneratedBy,
} from "../game/components/queries";
import { findPhaseDef, gameReducer, phaseCtx } from "../game/phases";
import { frontLine } from "../game/phases/warfare";
import { setupGame } from "../game/setup";
import type { CardInstance, Difficulty } from "../game/types";
import { CardView } from "./CardView";
import { DrawAnimation } from "./DrawAnimation";
import { PhaseNarrator } from "./PhaseNarrator";
import { PileView } from "./PileView";
import { FoodBadge, LaborBadge } from "./ResourceBadges";
import { HandFan } from "./HandFan";
import { CoinTossOverlay } from "./CoinTossOverlay";
import { MulliganOverlay } from "./MulliganOverlay";
import { HandTuningProvider, useHandTuning } from "../dev/handTuning";
import { HandTuningPanel } from "../dev/HandTuningPanel";
import { useShingleOverlap } from "./useShingleOverlap";
import { spawnMoveParticles, spawnTrailParticles } from "./particles";

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
 *  Two different things can be dragged, and they don't share a shape:
 *  a Worker is dropped *into the lane* (kind "place" — dropIndex is only
 *  meaningful while the freeWorkerPlacement modifier is on, see
 *  PLACE_WORKER, so it can be null while overLane is true without that
 *  meaning "not over the lane"), but a Draft card is dropped *onto a
 *  specific existing card* (kind "draft" — targetId is that card's id,
 *  or null while hovering anywhere that isn't a valid target). Which one
 *  applies is decided once, at "start", from the dragged card itself —
 *  see handleDragStart. */
type DragState =
  | { status: "idle" }
  | { status: "dragging"; cardId: string; kind: "place"; overLane: boolean; dropIndex: number | null }
  | { status: "dragging"; cardId: string; kind: "draft"; targetId: string | null };

type DragAction =
  | { type: "start"; cardId: string; kind: "place" | "draft" }
  | { type: "movePlace"; overLane: boolean; dropIndex: number | null }
  | { type: "moveDraft"; targetId: string | null }
  | { type: "end" };

const IDLE_DRAG_STATE: DragState = { status: "idle" };

function dragStateReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case "start":
      return action.kind === "place"
        ? { status: "dragging", cardId: action.cardId, kind: "place", overLane: false, dropIndex: null }
        : { status: "dragging", cardId: action.cardId, kind: "draft", targetId: null };
    case "movePlace":
      // No-op unless a "place" drag is actually in progress — a stray
      // move event can't un-idle a drag that never started, and can't
      // apply "place" fields to a "draft" drag either.
      return state.status === "dragging" && state.kind === "place"
        ? { ...state, overLane: action.overLane, dropIndex: action.dropIndex }
        : state;
    case "moveDraft":
      return state.status === "dragging" && state.kind === "draft"
        ? { ...state, targetId: action.targetId }
        : state;
    case "end":
      return IDLE_DRAG_STATE;
  }
}

/** Every state the Warfare-phase sword can be in. "idle" is ready and
 *  (for the player) clickable; "swinging" plays the strike itself, purely
 *  visual, before anything is dispatched; "dying" holds a snapshot of
 *  both lanes from just before RESOLVE_WARFARE landed, so the cards it
 *  destroyed can still be rendered fading out even though the real state
 *  has already moved on without them — see the effects below for how
 *  each transition fires. */
type AttackState =
  | { status: "idle" }
  | { status: "swinging" }
  | { status: "dying"; beforePlayer: CardInstance[]; beforeOpponent: CardInstance[] };

const IDLE_ATTACK_STATE: AttackState = { status: "idle" };
const SWING_MS = 380;
const DYING_MS = 340;
// Must match .lane__zone's own `gap` in index.css — the shingle math needs
// the real spacing it's shrinking to know when tokens have actually run
// out of room.
const LANE_BASE_GAP = 14;
// However crowded a lane gets, a tapped/untapped token never loses more
// than tokenWidth - LANE_MIN_PEEK of itself under its neighbor — see
// shingleLayout.ts.
const LANE_MIN_PEEK = 26;
// The flying drag copy's "lean into the direction of travel" tilt (see
// handleDragMove) — degrees per px of horizontal pointer movement since
// the last move event, capped, then eased toward rather than snapped to.
const DRAG_TILT_SENSITIVITY = 1.1;
const DRAG_TILT_MAX_DEG = 22;
const DRAG_TILT_SMOOTHING = 0.35;
// Per-frame multiplier the target tilt decays by while the pointer isn't
// actively adding to it — 0.88 of the previous value every ~16ms lands
// back near 0 well under a second after the pointer stops.
const DRAG_TILT_DECAY = 0.88;

interface GameBoardProps {
  onExitToMenu: () => void;
  difficulty: Difficulty;
}

export function GameBoard({ onExitToMenu, difficulty }: GameBoardProps) {
  // Lazy initializer, not `setupGame` passed directly — useReducer only
  // calls its init function once, on mount, so `difficulty` needs to be
  // closed over here rather than passed as useReducer's own init-arg
  // (which would have to be `difficulty` itself, and setupGame would then
  // need to be usable as `(arg) => GameState` with no override — it
  // already is, but closing over it here keeps this call self-explanatory
  // without relying on that shape lining up by coincidence).
  const [state, dispatch] = useReducer(gameReducer, undefined, () => setupGame(difficulty));
  const [logOpen, setLogOpen] = useState(false);
  const [drawingCard, setDrawingCard] = useState<CardInstance | null>(null);
  const [dragState, dispatchDrag] = useReducer(dragStateReducer, IDLE_DRAG_STATE);
  const [attackState, setAttackState] = useState<AttackState>(IDLE_ATTACK_STATE);
  const { tokenWidth } = useHandTuning();
  const { player, opponent, phase, turn, activeSide, pendingSacrifices, log, gameOver } = state;
  const topGraveyardCard = player.graveyard[player.graveyard.length - 1];
  const topOpponentGraveyardCard = opponent.graveyard[opponent.graveyard.length - 1];
  const canPlaceWorker = phase === "main" && activeSide === "player" && !player.hasPlacedWorkerThisTurn;
  const draggingCard =
    dragState.status === "dragging"
      ? player.hand.find((c) => c.instanceId === dragState.cardId)
      : undefined;
  const isOverLane = dragState.status === "dragging" && dragState.kind === "place" && dragState.overLane;
  const dropIndex =
    dragState.status === "dragging" && dragState.kind === "place" ? dragState.dropIndex : null;
  // The lane card currently under the pointer while dragging a Draft card
  // — the one about to be drafted if dropped right now (see Rules/Draft
  // Ability.md). Highlighted the same way a drop-index ghost is: only the
  // thing directly under the cursor, not every eligible card at once.
  const draftDragTargetId =
    dragState.status === "dragging" && dragState.kind === "draft" ? dragState.targetId : null;
  // The visible lane box (the dark rounded zone, sized to its actual
  // content) — deliberately not .lane__tokens, the big invisible flex
  // container it sits in: that spans most of the row's width, so testing
  // against it would count the drag as "over the lane" anywhere near it,
  // not just while actually touching the dark zone. Also used by the FLIP
  // effect below to measure lane token positions.
  const laneZoneRef = useRef<HTMLDivElement>(null);
  // The invisible flex:1 container each lane's zone sits inside — its
  // width is the real, unshrinkable "room available" a lane's tokens have
  // to fit into, which .lane__zone itself can't tell you (it's sized to
  // its own content, see the comment above). Fed into useShingleOverlap
  // below so tokens start overlapping exactly once they'd otherwise spill
  // past it.
  const laneTokensRef = useRef<HTMLDivElement>(null);
  const opponentLaneTokensRef = useRef<HTMLDivElement>(null);
  // A single viewport-fixed layer every particle burst spawns into (see
  // particles.ts) — one shared layer rather than one per token, since
  // particles briefly outlive the slide they came from and need to sit
  // above everything regardless of which token triggered them.
  const particlesLayerRef = useRef<HTMLDivElement>(null);
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
  // The flying card's own DOM node, written to directly by the tilt rAF
  // loop below (see runDragTiltLoop) rather than through React state —
  // that loop updates every animation frame regardless of whether a
  // pointer-move event fired, and routing 60-ish writes/sec through
  // setState would mean 60-ish re-renders/sec of the whole board for a
  // value nothing else reads.
  const dragGhostRef = useRef<HTMLDivElement>(null);
  // Degrees the flying card currently leans, and the velocity-derived
  // angle it's easing toward — two separate values (not one) specifically
  // so the tilt keeps animating toward 0 even once the pointer stops
  // moving entirely: target decays toward 0 every frame on its own, and
  // current keeps chasing target every frame, independent of whether a
  // new move event ever arrives. A single "set tilt on move, otherwise
  // leave it" version is what got the card stuck at whatever angle it
  // last had the instant the pointer stopped.
  const dragTiltRef = useRef(0);
  const dragTiltTargetRef = useRef(0);
  const dragTiltRafRef = useRef<number | null>(null);
  // The pointer position as of the previous move event, purely for the
  // trail/tilt math below (how far, which direction) — distinct from
  // cursorPos, which is where the card renders *now*. A ref, not state:
  // nothing needs to re-render off this by itself, only off cursorPos.
  const prevDragPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Runs every frame for as long as a drag is in progress: eases the
  // current tilt toward the target, and separately decays the target
  // itself toward 0 (a light "friction") so an idle pointer settles the
  // card level again on its own instead of only updating on new movement.
  function runDragTiltLoop() {
    dragTiltTargetRef.current *= DRAG_TILT_DECAY;
    dragTiltRef.current += (dragTiltTargetRef.current - dragTiltRef.current) * DRAG_TILT_SMOOTHING;
    dragGhostRef.current?.style.setProperty("--drag-tilt", `${dragTiltRef.current}deg`);
    dragTiltRafRef.current = requestAnimationFrame(runDragTiltLoop);
  }

  // Belt-and-suspenders for the rare case of unmounting mid-drag (e.g.
  // exiting to the main menu) — resetDragTracking handles every normal
  // end-of-drag path, but nothing calls it on unmount itself.
  useEffect(() => {
    return () => {
      if (dragTiltRafRef.current !== null) cancelAnimationFrame(dragTiltRafRef.current);
    };
  }, []);

  // A short activation distance so a plain click/tap still registers as a
  // click (see HandFan's onClick) instead of always starting a drag — only
  // a real, deliberate drag past that threshold takes over.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handlePlaceWorker(instanceId: string) {
    dispatch({ type: "PLACE_WORKER", instanceId });
  }

  // A Draft card has no click behavior of its own — it's played by
  // dragging it onto a target (see Rules/Draft Ability.md and
  // handleDragStart/computeDraftTarget below), the same way a Worker is
  // played by dragging it into the lane rather than clicking it.
  function handleHandCardClick(instanceId: string) {
    if (canPlaceWorker) handlePlaceWorker(instanceId);
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

  // Which lane card (if any) a Draft card would be played on if dropped
  // right now: point-in-rect against each individually-tracked lane card
  // (see laneCardRefs), same rect source computeDropIndex uses, just a
  // direct hit test instead of a "which gap" walk — a Draft card targets
  // one specific existing card, not a position between cards. Only
  // untapped, undrafted Workers are eligible; PLACE_WORKER-style gating
  // (phase/side/once-per-turn) is the caller's job, not this function's.
  function computeDraftTarget(pointer: { x: number; y: number } | null): string | null {
    if (!pointer) return null;
    for (const card of player.lane) {
      if (card.tapped || hasWarfare(card)) continue;
      const el = laneCardRefs.current.get(card.instanceId);
      if (el && pointInRect(pointer, el.getBoundingClientRect())) return card.instanceId;
    }
    return null;
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
    const cardId = String(event.active.id);
    const card = player.hand.find((c) => c.instanceId === cardId);
    // Which of the two drag flows this is (see DragState's own comment) —
    // decided once, up front, from the card itself: a Draft card is
    // dropped on a target, everything else is dropped into the lane.
    const kind = card && isAttachable(card) ? "draft" : "place";
    dispatchDrag({ type: "start", cardId, kind });
    const start = getEventCoordinates(event.activatorEvent);
    if (start) setCursorPos(start);
    prevDragPointerRef.current = start ?? null;
    dragTiltRef.current = 0;
    dragTiltTargetRef.current = 0;
    if (dragTiltRafRef.current === null) {
      dragTiltRafRef.current = requestAnimationFrame(runDragTiltLoop);
    }
  }

  // Draft-target gating lives here, alongside canPlaceWorker just above —
  // both are "would this drop actually do anything right now", not just
  // "is the pointer somewhere relevant": once-per-turn, right phase, right
  // side. A hover that couldn't complete shouldn't light anything up,
  // same reasoning as canPlaceWorker's own comment below.
  const canDraft = phase === "main" && activeSide === "player" && !player.hasDraftedThisTurn;

  // The dragged Draft card's own cost also has to actually be affordable
  // right now — same "would this drop actually do anything" reasoning as
  // canDraft above, just keyed on the specific card instead of turn state.
  // Draft's cost has more than one entry (Food and Labor); all of them
  // have to be covered at once (see components/queries.ts's canAfford).
  function canAffordDraftCard(cardId: string): boolean {
    const card = player.hand.find((c) => c.instanceId === cardId);
    return canAfford(player.resources, card && costOf(card));
  }

  function handleDragMove(event: DragMoveEvent) {
    const pointer = pointerPositionFor(event);
    setCursorPos(pointer);

    // The "shooting star" bit: lean into the direction the card's being
    // carried, and drop a sprinkle trail along the path it just crossed —
    // both driven off the same from/to pair, so they always agree on
    // where the card's actually been. This only ever pushes the tilt
    // *target* — runDragTiltLoop (a rAF loop, running independently of
    // move events) is what actually eases dragTiltRef toward it and
    // decays it back to 0 once the moves stop arriving.
    const prevPointer = prevDragPointerRef.current;
    if (pointer && prevPointer) {
      const dx = pointer.x - prevPointer.x;
      dragTiltTargetRef.current = Math.max(
        -DRAG_TILT_MAX_DEG,
        Math.min(DRAG_TILT_MAX_DEG, dx * DRAG_TILT_SENSITIVITY),
      );
      if (particlesLayerRef.current) {
        spawnTrailParticles(particlesLayerRef.current, prevPointer, pointer);
      }
    }
    prevDragPointerRef.current = pointer;

    if (dragState.status === "dragging" && dragState.kind === "draft") {
      const canDropHere = canDraft && canAffordDraftCard(dragState.cardId);
      dispatchDrag({ type: "moveDraft", targetId: canDropHere ? computeDraftTarget(pointer) : null });
      return;
    }
    // Gated on canPlaceWorker too, not just the rect overlap: a card can be
    // dragged any time (see HandFan), but if this drop couldn't actually
    // place it (wrong phase, already placed one this turn), the lane
    // shouldn't light up or offer a slot for it — that visual feedback is
    // a promise the drop can keep, not just "you're near the lane".
    const overLane = canPlaceWorker && isOverLaneRect(event);
    dispatchDrag({ type: "movePlace", overLane, dropIndex: dropIndexFor(overLane, pointer) });
  }

  // Shared by every way a drag can stop (dropped, cancelled) — clears the
  // tilt/trail tracking alongside cursorPos so a fresh drag starts level
  // and doesn't spawn a trail from wherever the pointer happens to already
  // be relative to the last drag's end point.
  function resetDragTracking() {
    setCursorPos(null);
    prevDragPointerRef.current = null;
    if (dragTiltRafRef.current !== null) {
      cancelAnimationFrame(dragTiltRafRef.current);
      dragTiltRafRef.current = null;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    // Read where it landed before "end" wipes the drag state, not after —
    // once it's "idle" there's no longer a dragged card to have an
    // opinion about. Dropped anywhere invalid (including nowhere at all)
    // is simply not a placement/draft, the same as an invalid click was
    // already a no-op: the card never left the hand, so there's nothing
    // to undo.
    if (dragState.status === "dragging" && dragState.kind === "draft") {
      const canDropHere = canDraft && canAffordDraftCard(dragState.cardId);
      const targetId = canDropHere ? computeDraftTarget(pointerPositionFor(event)) : null;
      dispatchDrag({ type: "end" });
      resetDragTracking();
      if (targetId) {
        dispatch({ type: "DRAFT", cardInstanceId: String(event.active.id), targetInstanceId: targetId });
      }
      return;
    }

    const droppedOnLane = canPlaceWorker && isOverLaneRect(event);
    const index = dropIndexFor(droppedOnLane, pointerPositionFor(event)) ?? undefined;
    dispatchDrag({ type: "end" });
    resetDragTracking();
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
    resetDragTracking();
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

  // Set right before dispatching RESOLVE_WARFARE; consumed by the layout
  // effect below the moment its result lands, so the cards it destroyed
  // can still be shown fading out (see AttackState's own comment) even
  // though they're already gone from `player.lane`/`opponent.lane` by
  // then. Same pendingDrawRef-style pattern as the Draw animation above.
  const pendingCombatRef = useRef<{ player: CardInstance[]; opponent: CardInstance[] } | null>(null);

  function handleAttackClick() {
    if (!(phase === "warfare" && activeSide === "player" && attackState.status === "idle")) return;
    if (frontLine(player.lane) === 0) return; // nothing to attack with — shouldn't even be clickable
    setAttackState({ status: "swinging" });
  }

  // The swing itself is purely visual — nothing is dispatched until it's
  // actually landed, so the player sees the strike before its result.
  useEffect(() => {
    if (attackState.status !== "swinging") return;
    const t = setTimeout(() => {
      pendingCombatRef.current = { player: player.lane, opponent: opponent.lane };
      dispatch({ type: "RESOLVE_WARFARE" });
    }, SWING_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackState.status]);

  // Fires once RESOLVE_WARFARE's result actually lands (guarded by the
  // ref, so it ignores every other reason `log` can change — nearly every
  // action logs something). Keyed on `log` rather than player.lane/
  // opponent.lane: those don't get new references when the fight is a
  // no-op (neither side has front-line Warfare, very likely turn 1), so
  // watching them left this stuck in "warfare" forever whenever nothing
  // died — `log` always changes, since RESOLVE_WARFARE always logs
  // something even for "no conflict". Shows the "dying" stage for
  // DYING_MS, then advances the phase for real — see warfare.ts's
  // ADVANCE, split from RESOLVE_WARFARE specifically so this has time to
  // play first.
  useLayoutEffect(() => {
    const before = pendingCombatRef.current;
    if (!before) return;
    pendingCombatRef.current = null;
    setAttackState({ status: "dying", beforePlayer: before.player, beforeOpponent: before.opponent });
    const t = setTimeout(() => {
      dispatch({ type: "ADVANCE" });
      setAttackState(IDLE_ATTACK_STATE);
    }, DYING_MS);
    return () => clearTimeout(t);
  }, [log]);

  // The opponent has no button to click — its own Warfare phase plays the
  // identical swing/resolve/dying sequence automatically, after a brief
  // pause so it reads as a deliberate beat rather than an instant cut.
  // But only when its difficulty's own policy actually wants to fight
  // (see ai.ts's shouldOpponentAttack — "dumb" swings with anything it
  // has, "hard" only when it's winning, etc.): RESOLVE_WARFARE compares
  // both sides' *current* front lines regardless of who triggered it, so
  // dispatching it on a decline wouldn't be a no-op — the player's own
  // leftover Warfare, if any, would still "win" and rout the opponent on
  // a turn where the opponent never chose to fight at all. Declining just
  // skips straight to ADVANCE, the same as the player clicking "Next".
  useEffect(() => {
    if (phase !== "warfare" || activeSide !== "opponent" || attackState.status !== "idle") return;
    // shouldOpponentAttack reads both sides' front lines (see its own
    // comment — the decision depends on the matchup, not just what the
    // opponent itself has), so this now has to watch player.lane too, not
    // just opponent.lane.
    if (!shouldOpponentAttack(state)) {
      const t = setTimeout(() => dispatch({ type: "ADVANCE" }), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAttackState({ status: "swinging" }), 500);
    return () => clearTimeout(t);
  }, [phase, activeSide, attackState.status, opponent.lane, player.lane]);

  // While a fight's result is still animating, the lane renders from this
  // snapshot instead of the real (already-updated) state — see
  // AttackState's own comment.
  const displayPlayerLane = attackState.status === "dying" ? attackState.beforePlayer : player.lane;
  const displayOpponentLane = attackState.status === "dying" ? attackState.beforeOpponent : opponent.lane;
  function isDyingCard(card: CardInstance, realLane: CardInstance[]): boolean {
    return attackState.status === "dying" && !realLane.some((c) => c.instanceId === card.instanceId);
  }

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
    displayPlayerLane.forEach((card) => laneItems.push({ id: card.instanceId, kind: "card", card }));
  }

  const laneShingleOverlap = useShingleOverlap(
    laneTokensRef,
    laneItems.length,
    tokenWidth,
    LANE_BASE_GAP,
    LANE_MIN_PEEK,
  );
  const opponentLaneShingleOverlap = useShingleOverlap(
    opponentLaneTokensRef,
    displayOpponentLane.length,
    tokenWidth,
    LANE_BASE_GAP,
    LANE_MIN_PEEK,
  );

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
          if (particlesLayerRef.current) {
            spawnMoveParticles(particlesLayerRef.current, rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
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
    const raw = findPhaseDef(phase)?.narrator;
    const def = typeof raw === "function" ? raw(state, phaseCtx) : raw;
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
    // activeSide is in the deps defensively, not because it's needed
    // today: Main's narrator reads it (see main.ts, "Your Turn" vs
    // "Opponent's Turn"), and right now activeSide only ever changes
    // alongside phase anyway (see phases/end.ts) — but the two are
    // logically independent, so this doesn't rely on that staying true.
  }, [phase, activeSide]);

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
        <div className="board-particles" ref={particlesLayerRef} />
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
            Turn {turn} · <strong>{activeSide === "player" ? "You" : "Opponent"}</strong> ·{" "}
            <strong className="hud__phase">{phase.toUpperCase()}</strong>
          </span>
          {(() => {
            // The button's destination label comes from the active phase's
            // own definition (game/phases/*.ts), never hardcoded here — a
            // phase with no nextLabel (mulligan, upkeep) renders no button,
            // and Main renders none on the opponent's own turn either (its
            // nextLabel returns undefined then — see main.ts), since it
            // advances by itself in both cases.
            const nextLabelDef = findPhaseDef(phase)?.nextLabel;
            const label =
              typeof nextLabelDef === "function" ? nextLabelDef(state, phaseCtx) : nextLabelDef;
            if (!label) return null;
            return (
              <button
                className="phase-btn"
                onClick={handleAdvance}
                // Warfare's own Next (skip attacking) shares this same
                // button with every other phase's — disabled while a
                // sword-triggered attack is already resolving, so a click
                // here can't dispatch a second ADVANCE mid-sequence and
                // skip past a phase transition the animation is still
                // about to make on its own (see the "dying" effect above).
                disabled={phase === "warfare" && attackState.status !== "idle"}
              >
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
              <div className="lane__tokens lane__tokens--reversed" ref={opponentLaneTokensRef}>
                <div
                  className="lane__zone lane__zone--reversed"
                  style={{ "--shingle-overlap": `${opponentLaneShingleOverlap}px` } as CSSProperties}
                >
                  {displayOpponentLane.length > 0 ? (
                    displayOpponentLane.map((card) => (
                      <div
                        key={card.instanceId}
                        className={`lane__slot ${isDyingCard(card, opponent.lane) ? "lane__slot--dying" : ""}`}
                      >
                        <CardView card={card} variant="lane" />
                      </div>
                    ))
                  ) : (
                    <div className="lane__ghost" />
                  )}
                  {phase === "warfare" && activeSide === "opponent" && frontLine(opponent.lane) > 0 ? (
                    <div
                      className={`lane__sword lane__sword--inert ${
                        attackState.status === "swinging" ? "lane__sword--swinging" : ""
                      }`}
                    >
                      <Swords size={18} />
                    </div>
                  ) : (
                    <ArrowLeft className="lane__arrow" size={18} />
                  )}
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
              <div
                className={`lane__tokens ${isOverLane ? "lane__tokens--drop-active" : ""}`}
                ref={laneTokensRef}
              >
                <div
                  className="lane__zone"
                  ref={laneZoneRef}
                  style={{ "--shingle-overlap": `${laneShingleOverlap}px` } as CSSProperties}
                >
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
                      const inUpkeep =
                        phase === "upkeep" && activeSide === "player" && pendingSacrifices > 0;
                      // A drafted card still taps for its resource exactly
                      // like any other Worker (see Rules/Drafting
                      // Population Risk.md) — tapping it is also what
                      // excludes it from this turn's front line (Rules/
                      // Turned Warfare Exclusion.md), so it's a real
                      // choice, not a dead click. Gated on
                      // resourceGeneratedBy too, not just tapped: a
                      // Draft attachment's penalty can zero a Basic
                      // Worker's output entirely (see components/
                      // queries.ts), and a card with nothing to generate
                      // shouldn't look clickable.
                      const canTap =
                        phase === "main" &&
                        activeSide === "player" &&
                        !card.tapped &&
                        !!resourceGeneratedBy(card);
                      const onClick = inUpkeep
                        ? () => dispatch({ type: "SACRIFICE_WORKER", instanceId: card.instanceId })
                        : canTap
                        ? () => dispatch({ type: "TAP_WORKER", instanceId: card.instanceId })
                        : undefined;

                      const dying = isDyingCard(card, player.lane);

                      return (
                        <div
                          key={card.instanceId}
                          className={`lane__slot ${dying ? "lane__slot--dying" : ""}`}
                          data-flip-id={card.instanceId}
                          ref={(el) => registerLaneCardRef(card.instanceId, el)}
                        >
                          <CardView
                            card={card}
                            variant="lane"
                            onClick={onClick}
                            highlight={inUpkeep}
                            // Glows while a Draft card is being dragged
                            // directly over it (see draftDragTargetId) —
                            // the one card that would actually be drafted
                            // if dropped right now.
                            targetable={draftDragTargetId === card.instanceId}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <div className="lane__ghost" />
                  )}
                  {phase === "warfare" && activeSide === "player" && frontLine(player.lane) > 0 ? (
                    <button
                      className={`lane__sword ${
                        attackState.status === "swinging" ? "lane__sword--swinging" : ""
                      }`}
                      onClick={handleAttackClick}
                      disabled={attackState.status !== "idle"}
                      title="Attack"
                    >
                      <Swords size={18} />
                    </button>
                  ) : (
                    <ArrowRight className="lane__arrow" size={18} />
                  )}
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
              // Always passed, same "attempt it, an invalid attempt is
              // just a harmless no-op" philosophy as dragging any hand
              // card any time (see HandFan's own draggable comment) —
              // handleHandCardClick itself gates what actually happens
              // per card type/phase.
              onCardClick={handleHandCardClick}
            />
          </div>
        </div>

        {drawingCard && (
          <DrawAnimation card={drawingCard} onDone={() => setDrawingCard(null)} />
        )}

        {narrator && <PhaseNarrator message={narrator.message} durationMs={narrator.delayMs} />}

        {phase === "coinToss" && (
          <CoinTossOverlay
            firstSide={state.firstSide}
            onConfirm={() => dispatch({ type: "CONFIRM_COIN_TOSS" })}
          />
        )}

        {phase === "mulligan" && (
          <MulliganOverlay
            hand={player.hand}
            onConfirm={() => dispatch({ type: "CONFIRM_MULLIGAN" })}
            onFinish={() => dispatch({ type: "FINISH_MULLIGAN" })}
          />
        )}

        {gameOver &&
          (() => {
            // Population collapse used to only ever be the player's own
            // doing (an Upkeep sacrifice emptying their own lane), so this
            // text could stay static. Now Warfare can rout either side —
            // see phases/warfare.ts — so it has to say who actually lost.
            const playerLost = player.lane.length === 0;
            const opponentLost = opponent.lane.length === 0;
            const title = playerLost && opponentLost ? "Mutual Defeat" : playerLost ? "Defeat" : "Victory";
            const message =
              playerLost && opponentLost
                ? "Both civilizations collapsed at once."
                : playerLost
                ? "Your population collapsed to 0."
                : "The opponent's population collapsed to 0.";
            return (
              <div className="overlay">
                <div className="overlay__card">
                  <h2>{title}</h2>
                  <p>{message}</p>
                  <div className="overlay__actions">
                    <button onClick={() => dispatch({ type: "RESTART" })}>Restart</button>
                    <button className="overlay__secondary" onClick={onExitToMenu}>
                      Main Menu
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
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
          dnd-kit's own positioning system.

          Wrapped in .drag-ghost so index.css can style "currently airborne"
          (lift, velocity tilt, ground shadow, hold-bob) without that
          becoming a CardView prop for what's still this one call site.
          --drag-tilt isn't set here — runDragTiltLoop writes it straight
          to this node every frame via dragGhostRef (see its own comment
          for why that's a ref-write and not a piece of React state). */}
      {draggingCard && cursorPos && (
        <div
          ref={dragGhostRef}
          className="drag-ghost"
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
          <div className="drag-ghost__shadow" />
          <CardView card={draggingCard} variant="lane" noPreview />
        </div>
      )}
      </DndContext>
    </HandTuningProvider>
  );
}
