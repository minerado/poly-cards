import { forwardRef } from "react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { definitionOf, typeLineOf } from "../game/components/queries";
import type { CardDefinition } from "../game/components/types";
import type { CardInstance } from "../game/types";
import { withBadges } from "./cardMarkup";
import { ResourceBadge, WarfareBadge } from "./ResourceBadges";

const LANE_JITTER_MAX_DEG = 5;

/** A small, stable-per-card rotation so a placed worker reads as tossed
 *  down rather than machine-aligned — deterministic from instanceId (not
 *  Math.random()) so it doesn't re-roll on every re-render.
 *
 *  instanceIds are `${defId}-${n}` (see game/cards.ts), so adjacent cards
 *  of the same type differ only in their trailing digit — a plain
 *  polynomial hash carries that near-identical input straight through to
 *  a near-identical output (every card in a lane came out tilted the same
 *  way). FNV-1a plus a Murmur3-style avalanche finalizer scrambles small
 *  input differences into unrelated output bits, so consecutive ids land
 *  nowhere near each other. */
function hashString(s: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function laneJitterDeg(instanceId: string): number {
  const normalized = hashString(instanceId) / 0xffffffff; // 0..1
  return (normalized * 2 - 1) * LANE_JITTER_MAX_DEG;
}

interface CardViewProps {
  card: CardInstance;
  variant: "hand" | "lane" | "mulligan";
  onClick?: () => void;
  highlight?: boolean;
  /** A valid target while some other card is armed for a targeted ability
   *  (e.g. a Draft card in hand waiting for a Worker to flip) — its own
   *  glow, distinct from `highlight`'s (danger/Upkeep) meaning. */
  targetable?: boolean;
  /** Renders the card back instead of its face — never actionable regardless of `onClick`. */
  faceDown?: boolean;
  /** Extra props (drag listeners/aria attributes) spread onto the card's
   *  own button — see HandFan's HandFanCard. These need to land on the
   *  button specifically, not a wrapper: it's the element the fan's own
   *  rotate/translateY transform is applied to, so it's the only one
   *  whose rect actually matches where the card is visually drawn. A
   *  drag library tracking an untransformed ancestor instead ends up
   *  measuring a box nowhere near the card's real position. */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Skips the lane token's hover-preview sibling even though `variant`
   *  is "lane" — for one-off token-styled renders (the drag overlay)
   *  that aren't an actual field token, where the preview would be not
   *  just pointless but actively wrong: it shows on CSS :hover, and a
   *  drag overlay tracks the cursor everywhere it goes. */
  noPreview?: boolean;
}

/**
 * A card only ever has two looks, everywhere in the game:
 * - Normal: the full Magic-style frame (name bar, art, type line, rules
 *   text). Used in hand and mulligan directly, and as the field token's
 *   hover preview.
 * - Token: the field's small, description-free marker — name bar, art, and
 *   (if it has one) a resource strip standing in for the full rules text.
 *   Hovering a token shows the Normal card over it instead of zooming the
 *   token itself (too small to zoom legibly).
 */
function CardFace({ def, showDetails }: { def: CardDefinition; showDetails: boolean }) {
  const typeLine = showDetails ? typeLineOf(def) : undefined;
  const resourceGenerator = !showDetails ? def.components.resourceGenerator : undefined;

  return (
    <>
      <div className="card__namebar">
        <span className="card__name">{def.name}</span>
      </div>
      <div className="card__artbox">
        <img className="card__image" src={def.image} alt={def.name} draggable={false} />
      </div>
      {resourceGenerator && (
        <div className="card__resourcebar">
          <ResourceBadge resource={resourceGenerator.resource} />
        </div>
      )}
      {showDetails && (
        <>
          {typeLine && <div className="card__typeline">{typeLine}</div>}
          <div className="card__textbox">
            {def.description && (
              <p
                className="card__description"
                style={def.descriptionFontSize ? { fontSize: def.descriptionFontSize } : undefined}
              >
                {withBadges(def.description)}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export const CardView = forwardRef<HTMLButtonElement, CardViewProps>(function CardView(
  { card, variant, onClick, highlight, targetable, faceDown, buttonProps, noPreview },
  ref,
) {
  const classes = [
    "card",
    `card--${variant}`,
    card.tapped ? "card--tapped" : "",
    card.drafted ? "card--drafted" : "",
    !faceDown && onClick ? "card--actionable" : "",
    highlight ? "card--highlight" : "",
    targetable ? "card--targetable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (faceDown) {
    return <button ref={ref} type="button" className={`${classes} card--back`} disabled />;
  }

  const isToken = variant === "lane";
  const style = isToken
    ? ({ "--jitter": `${laneJitterDeg(card.instanceId)}deg` } as CSSProperties)
    : undefined;

  // Drafted (flipped into Warfare — see Rules/Draft Ability.md): shows the
  // same back art as a genuinely hidden card, not its face. The specific
  // Worker it used to be stops mattering once it's Warfare, so there's
  // nothing left to reveal — just a Warfare marker standing in for the
  // whole face. Stays interactive (unlike the opponent's truly face-down
  // hand above): the button keeps its normal onClick/disabled behavior.
  if (isToken && card.drafted) {
    return (
      <button
        ref={ref}
        type="button"
        className={`${classes} card--back`}
        onClick={onClick}
        disabled={!onClick}
        style={style}
        {...buttonProps}
      >
        <div className="card__resourcebar card__resourcebar--back">
          <WarfareBadge />
        </div>
      </button>
    );
  }

  const def = definitionOf(card);
  const cardButton = (
    <button
      ref={ref}
      type="button"
      className={classes}
      onClick={onClick}
      disabled={!onClick}
      style={style}
      {...buttonProps}
    >
      <CardFace def={def} showDetails={!isToken} />
    </button>
  );

  if (!isToken || noPreview) return cardButton;

  // .card itself clips to its rounded corners (overflow: hidden), so the
  // Normal preview lives in a sibling instead of a child — otherwise it'd be
  // cut off the moment it grew past the tiny token's own bounds.
  return (
    <div className="card-slot">
      {cardButton}
      <div className="card card__preview">
        <CardFace def={def} showDetails />
      </div>
    </div>
  );
});
