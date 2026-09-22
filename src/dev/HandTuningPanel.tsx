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

interface Section {
  id: string;
  label: string;
  sliders: SliderDef[];
}

const SECTIONS: Section[] = [
  {
    id: "cards",
    label: "Cards",
    sliders: [
      { key: "readableCardWidth", label: "Readable card size (px)", min: 150, max: 320, step: 2 },
      { key: "handCardWidth", label: "In-hand card size (px)", min: 80, max: 220, step: 2 },
      { key: "tokenWidth", label: "Lane token size (px)", min: 60, max: 160, step: 2 },
      { key: "maxRotation", label: "Fan curl (max °)", min: 0, max: 20, step: 1 },
      { key: "rotationStep", label: "Fan curl per card (°)", min: 0, max: 10, step: 0.5 },
      { key: "riseFactor", label: "Dome height", min: 0, max: 10, step: 0.5 },
      { key: "overlap", label: "Card overlap (px)", min: -80, max: 0, step: 2 },
      { key: "peek", label: "Peek height (px)", min: 80, max: 220, step: 2 },
    ],
  },
  {
    id: "board",
    label: "Wood board",
    sliders: [
      { key: "boardMarginX", label: "Board width (side margin, px)", min: 0, max: 300, step: 4 },
      { key: "boardMarginY", label: "Board height (top/bottom margin, px)", min: 0, max: 300, step: 4 },
      { key: "boardShadowBlur", label: "Shadow depth (blur, px)", min: 0, max: 120, step: 2 },
      { key: "boardShadowOpacity", label: "Shadow intensity", min: 0, max: 1, step: 0.05 },
      { key: "playerDistance", label: "Distance between players (px)", min: 0, max: 300, step: 4 },
      { key: "laneZonePadding", label: "Lane indicator padding (px)", min: 0, max: 40, step: 2 },
    ],
  },
];

function SliderRow({
  def,
  value,
  onChange,
}: {
  def: SliderDef;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="hand-tuning__row">
      <span>
        {def.label} <em>{value}</em>
      </span>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Position-absolute, hideable game-config dev panel — a vertical stack of
 *  tabs, one per section, each dropping its sliders down when clicked. See
 *  handTuning.tsx for the values themselves. */
export function HandTuningPanel() {
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(SECTIONS[0].id);
  const { tuning, set, reset } = useHandTuningControls();

  if (!open) {
    return (
      <button className="hand-tuning__toggle" onClick={() => setOpen(true)} title="Game config">
        ⚙
      </button>
    );
  }

  return (
    <div className="hand-tuning">
      <div className="hand-tuning__header">
        <span>Game config</span>
        <button className="hand-tuning__close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      {SECTIONS.map((section) => {
        const isOpen = openSection === section.id;
        return (
          <div className="hand-tuning__tab-block" key={section.id}>
            <button
              className="hand-tuning__tab"
              onClick={() => setOpenSection(isOpen ? null : section.id)}
              aria-expanded={isOpen}
            >
              <span>{section.label}</span>
              <span className="hand-tuning__tab-caret">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="hand-tuning__tab-body">
                {section.sliders.map((def) => (
                  <SliderRow
                    key={def.key}
                    def={def}
                    value={tuning[def.key]}
                    onChange={(value) => set(def.key, value)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

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
