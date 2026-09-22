import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Live-tunable hand-fan knobs, for the on-screen dev panel (HandTuningPanel)
 * — every value here has a default that matches what the fan looked like
 * before this existed, so the panel is purely additive: leave it alone and
 * nothing changes.
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
}

export const DEFAULT_HAND_TUNING: HandTuning = {
  readableCardWidth: 250,
  handCardWidth: 148,
  maxRotation: 9,
  rotationStep: 2,
  riseFactor: 2,
  overlap: -36,
  peek: 122,
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

  // Published globally (not just to HandFan) since readableCardWidth is the
  // "Normal" card size used everywhere — mulligan, the lane hover preview,
  // a hovered hand card — not just the fan's own layout.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--readable-card-width",
      `${tuning.readableCardWidth}px`,
    );
  }, [tuning.readableCardWidth]);

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
