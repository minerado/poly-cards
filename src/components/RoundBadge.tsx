import type { ReactNode } from "react";

/**
 * Base component for every small inline glyph in the game — think Magic's
 * mana symbols: every one is the same shape (round). This is the only
 * place that shape is defined; a specific badge (TurnBadge, FoodBadge, …)
 * is built on top of it and only ever adds its own icon and color via
 * `className`, never its own span/shape. Sizing is left to the caller (em
 * units cascade in from wherever a badge is placed) rather than baked in
 * here, since a badge may need to show up bigger somewhere later.
 */
export function RoundBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className ? `round-badge ${className}` : "round-badge"}>{children}</span>
  );
}
