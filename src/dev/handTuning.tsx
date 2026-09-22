import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Live-tunable game-config knobs (cards, hand fan, wood board), for the
 * on-screen dev panel (HandTuningPanel) — every value here has a default
 * that matches what the game looked like before this existed, so the panel
 * is purely additive: leave it alone and nothing changes.
 */
export interface HandTuning {
  /** The card's real, readable size, px wide — every "Normal" card in the
   *  game (mulligan, the lane hover preview, a hovered hand card) renders
   *  at this fixed size. Not a base multiplied by anything else. */
  readableCardWidth: number;
  /** The fan's resting (unhovered) card width, px wide — its own fixed
   *  size, independent of readableCardWidth, not a percentage of it. Two
   *  predefined sizes, not one derived from the other. */
  handCardWidth: number;
  /** Degrees the outermost cards rotate to (fanLayout's maxRotation). */
  maxRotation: number;
  /** Degrees of rotation added per card away from center (fanLayout's rotationStep). */
  rotationStep: number;
  /** How tall the dome rises at the center card (fanLayout's riseFactor). */
  riseFactor: number;
  /** Horizontal overlap between adjacent cards, px (negative = overlap). */
  overlap: number;
  /** Vertical px the whole fan sits below the tray's top edge (how much "peeks" up). */
  peek: number;
  /** The lane token's width, px — also what the deck/graveyard piles
   *  match themselves to, and what the lane indicator sizes itself
   *  around (see laneZonePadding). */
  tokenWidth: number;

  /** Wood board's left/right margin from the screen edge, px (smaller = wider board). */
  boardMarginX: number;
  /** Wood board's top/bottom margin from the screen edge, px — independent
   *  of the hand-trays, so 0 lets it fill the full screen height (cards
   *  then sit visibly on top of it, wherever it reaches). */
  boardMarginY: number;
  /** Blur radius of the board's outer drop shadow, px (bigger = softer/more depth). */
  boardShadowBlur: number;
  /** Opacity (0–1) of both the outer drop shadow and the inset edge shadow. */
  boardShadowOpacity: number;
  /** Extra px inserted at the seam between the two players' main lanes —
   *  the board itself doesn't grow, the two lanes just sit further apart
   *  within it. */
  playerDistance: number;
  /** Padding (px, all sides) between the lane indicator's edge and the
   *  tokens/ghost it wraps — the indicator's own size is never set
   *  directly, it's always token size + this padding. */
  laneZonePadding: number;
}

export const DEFAULT_HAND_TUNING: HandTuning = {
  readableCardWidth: 250,
  handCardWidth: 148,
  maxRotation: 9,
  rotationStep: 2,
  riseFactor: 2,
  overlap: -30,
  peek: 122,
  tokenWidth: 90,
  boardMarginX: 40,
  boardMarginY: 40,
  boardShadowBlur: 14,
  boardShadowOpacity: 0.45,
  playerDistance: 44,
  laneZonePadding: 8,
};

const STORAGE_KEY = "poly-cards:hand-tuning";

function loadStored(): Partial<HandTuning> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface HandTuningContextValue {
  tuning: HandTuning;
  set: <K extends keyof HandTuning>(key: K, value: HandTuning[K]) => void;
  reset: () => void;
}

const HandTuningContext = createContext<HandTuningContextValue | null>(null);

export function HandTuningProvider({ children }: { children: ReactNode }) {
  const [tuning, setTuning] = useState<HandTuning>(() => ({
    ...DEFAULT_HAND_TUNING,
    ...loadStored(),
  }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
    } catch {
      // Best-effort only — a full/blocked localStorage shouldn't break tuning.
    }
  }, [tuning]);

  // Published globally (not just to HandFan) since readableCardWidth and
  // tokenWidth are the "Normal"/token card sizes used everywhere — mulligan,
  // the lane hover preview, a hovered hand card, lane tokens, and the
  // deck/graveyard piles (which match tokenWidth) — not just the fan.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--readable-card-width", `${tuning.readableCardWidth}px`);
    root.setProperty("--token-width", `${tuning.tokenWidth}px`);
  }, [tuning.readableCardWidth, tuning.tokenWidth]);

  // Same global-publish approach for the wood board (.wood-board reads these
  // directly) — it's a plain CSS element, not a component with its own
  // props, so there's no other tidy place to hand it live values.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--board-margin-x", `${tuning.boardMarginX}px`);
    root.setProperty("--board-margin-y", `${tuning.boardMarginY}px`);
    root.setProperty("--board-shadow-blur", `${tuning.boardShadowBlur}px`);
    root.setProperty("--board-shadow-opacity", `${tuning.boardShadowOpacity}`);
    root.setProperty("--player-distance", `${tuning.playerDistance}px`);
    root.setProperty("--lane-zone-padding", `${tuning.laneZonePadding}px`);
  }, [
    tuning.boardMarginX,
    tuning.boardMarginY,
    tuning.boardShadowBlur,
    tuning.boardShadowOpacity,
    tuning.playerDistance,
    tuning.laneZonePadding,
  ]);

  const value = useMemo<HandTuningContextValue>(
    () => ({
      tuning,
      set: (key, value) => setTuning((prev) => ({ ...prev, [key]: value })),
      reset: () => setTuning(DEFAULT_HAND_TUNING),
    }),
    [tuning],
  );

  return <HandTuningContext.Provider value={value}>{children}</HandTuningContext.Provider>;
}

/** Falls back to the defaults when rendered outside a provider (e.g. the mulligan fan). */
export function useHandTuning(): HandTuning {
  return useContext(HandTuningContext)?.tuning ?? DEFAULT_HAND_TUNING;
}

export function useHandTuningControls(): HandTuningContextValue {
  const ctx = useContext(HandTuningContext);
  if (!ctx) throw new Error("useHandTuningControls must be used within a HandTuningProvider");
  return ctx;
}
