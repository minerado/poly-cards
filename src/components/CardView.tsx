import { definitionOf } from "../game/components/queries";
import type { CardInstance } from "../game/types";

interface CardViewProps {
  card: CardInstance;
  variant: "hand" | "lane" | "mulligan";
  onClick?: () => void;
  actionLabel?: string;
  highlight?: boolean;
}

export function CardView({
  card,
  variant,
  onClick,
  actionLabel,
  highlight,
}: CardViewProps) {
  const def = definitionOf(card);
  const gen = def.components.resourceGenerator;
  const classes = [
    "card",
    `card--${variant}`,
    card.tapped ? "card--tapped" : "",
    onClick ? "card--actionable" : "",
    highlight ? "card--highlight" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick}>
      <img className="card__image" src={def.image} alt={def.name} draggable={false} />
      <div className="card__footer">
        <span className="card__name">{def.name}</span>
        {gen && (
          <span className="card__ability">
            🔄 {gen.amount} {gen.resource}
          </span>
        )}
      </div>
      {onClick && actionLabel && <span className="card__hint">{actionLabel}</span>}
    </button>
  );
}
