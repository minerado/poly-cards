/**
 * A card's rotation/rise within a symmetric fan of `total` cards at
 * `index` — the center card rises highest and stays upright; cards
 * further out rotate outward (capped) and sit progressively lower. Shared
 * by every fanned-out hand of cards in the game (the player's hand tray,
 * the mulligan overlay, …) so they all read as the same gesture.
 */

const MAX_ROTATION = 6;
const ROTATION_STEP = 4;
const RISE_FACTOR = 4;

export interface FanSlot {
  /** Degrees to rotate this card. */
  rotate: number;
  /** Px to rise this card (negative = up). */
  drop: number;
}

export function fanSlot(
  index: number,
  total: number,
  {
    riseFactor = RISE_FACTOR,
    maxRotation = MAX_ROTATION,
    rotationStep = ROTATION_STEP,
  }: { riseFactor?: number; maxRotation?: number; rotationStep?: number } = {},
): FanSlot {
  const center = (total - 1) / 2;
  const offset = index - center;
  const rotate = Math.max(-maxRotation, Math.min(maxRotation, offset * rotationStep));
  const drop = -(center * center - offset * offset) * riseFactor;
  return { rotate, drop };
}
