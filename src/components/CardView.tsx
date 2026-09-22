import { definitionOf, typeLineOf } from "../game/components/queries";
import type { CardDefinition } from "../game/components/types";
import type { CardInstance } from "../game/types";
import { withBadges } from "./cardMarkup";

interface CardViewProps {
  card: CardInstance;
  variant: "hand" | "lane" | "mulligan";
  onClick?: () => void;
  highlight?: boolean;
  /** Renders the card back instead of its face — never actionable regardless of `onClick`. */
  faceDown?: boolean;
}

/**
 * A card only ever has two looks, everywhere in the game:
 * - Normal: the full Magic-style frame (name bar, art, type line, rules
 *   text). Used in hand and mulligan directly, and as the field token's
 *   hover preview.
 * - Token: the field's small, description-free marker — name bar and art,
 *   nothing else. Hovering a token shows the Normal card over it instead
 *   of zooming the token itself (too small to zoom legibly).
 */
function CardFace({ def, showDetails }: { def: CardDefinition; showDetails: boolean }) {
  const typeLine = showDetails ? typeLineOf(def) : undefined;

  return (
    <>
      <div className="card__namebar">
        <span className="card__name">{def.name}</span>
      </div>
      <div className="card__artbox">
        <img className="card__image" src={def.image} alt={def.name} draggable={false} />
      </div>
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

export function CardView({ card, variant, onClick, highlight, faceDown }: CardViewProps) {
  const classes = [
    "card",
    `card--${variant}`,
    card.tapped ? "card--tapped" : "",
    !faceDown && onClick ? "card--actionable" : "",
    highlight ? "card--highlight" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (faceDown) {
    return <button type="button" className={`${classes} card--back`} disabled />;
  }

  const def = definitionOf(card);
  const isToken = variant === "lane";

  const cardButton = (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick}>
      <CardFace def={def} showDetails={!isToken} />
    </button>
  );

  if (!isToken) return cardButton;

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
}
