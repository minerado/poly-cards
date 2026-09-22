import { useState } from "react";
import { DEFAULT_HAND_TUNING, useHandTuningControls } from "./handTuning";
import type { HandTuning } from "./handTuning";

interface SliderDef {
  key: keyof HandTuning;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDef[] = [
  { key: "readableCardWidth", label: "Readable card size (px)", min: 150, max: 320, step: 2 },
  { key: "handCardWidth", label: "In-hand card size (px)", min: 80, max: 220, step: 2 },
  { key: "maxRotation", label: "Fan curl (max °)", min: 0, max: 20, step: 1 },
  { key: "rotationStep", label: "Fan curl per card (°)", min: 0, max: 10, step: 0.5 },
  { key: "riseFactor", label: "Dome height", min: 0, max: 10, step: 0.5 },
  { key: "overlap", label: "Card overlap (px)", min: -80, max: 0, step: 2 },
  { key: "peek", label: "Peek height (px)", min: 80, max: 220, step: 2 },
];

/** Position-absolute, hideable dev panel for live-tweaking the hand fan's layout — see handTuning.tsx. */
export function HandTuningPanel() {
  const [open, setOpen] = useState(false);
  const { tuning, set, reset } = useHandTuningControls();

  if (!open) {
    return (
      <button className="hand-tuning__toggle" onClick={() => setOpen(true)} title="Hand fan tuning">
        ⚙
      </button>
    );
  }

  return (
    <div className="hand-tuning">
      <div className="hand-tuning__header">
        <span>Hand fan tuning</span>
        <button className="hand-tuning__close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      {SLIDERS.map(({ key, label, min, max, step }) => (
        <label className="hand-tuning__row" key={key}>
          <span>
            {label} <em>{tuning[key]}</em>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={tuning[key]}
            onChange={(e) => set(key, Number(e.target.value))}
          />
        </label>
      ))}

      <div className="hand-tuning__actions">
        <button onClick={reset}>Reset</button>
        <button
          onClick={() =>
            navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2)).catch(() => {})
          }
        >
          Copy values
        </button>
      </div>
      <pre className="hand-tuning__readout">{JSON.stringify(tuning)}</pre>
      {JSON.stringify(tuning) === JSON.stringify(DEFAULT_HAND_TUNING) && (
        <div className="hand-tuning__hint">(at defaults)</div>
      )}
    </div>
  );
}
