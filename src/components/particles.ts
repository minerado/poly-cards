/**
 * A one-shot burst of small motes at (x, y) — viewport coordinates, meant
 * for a `position: fixed` layer covering the whole screen (see GameBoard's
 * .board-particles). Plain DOM, not React state: this fires from inside
 * the FLIP effect's imperative move-detection (see GameBoard.tsx), which
 * already works this way — a burst is a fire-and-forget visual flourish,
 * not game state, so there's nothing for React to own here. Each particle
 * removes itself from the DOM once its own CSS animation ends.
 */
const PARTICLE_COUNT_MIN = 5;
const PARTICLE_COUNT_RANGE = 3;
const PARTICLE_DIST_MIN = 14;
const PARTICLE_DIST_RANGE = 18;
const PARTICLE_SIZE_MIN = 3;
const PARTICLE_SIZE_RANGE = 3;

export function spawnMoveParticles(layer: HTMLElement, x: number, y: number): void {
  const count = PARTICLE_COUNT_MIN + Math.floor(Math.random() * PARTICLE_COUNT_RANGE);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = PARTICLE_DIST_MIN + Math.random() * PARTICLE_DIST_RANGE;
    const size = PARTICLE_SIZE_MIN + Math.random() * PARTICLE_SIZE_RANGE;

    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty("--particle-dx", `${Math.cos(angle) * dist}px`);
    particle.style.setProperty("--particle-dy", `${Math.sin(angle) * dist}px`);
    particle.style.setProperty("--particle-size", `${size}px`);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
    layer.appendChild(particle);
  }
}

// How far apart (px) trail sprinkles land along a drag's path — not a
// per-move fixed count, since move events don't arrive at a fixed
// distance apart (a fast flick covers much more ground per event than a
// slow drag). Interpolating by distance instead keeps the trail's density
// consistent regardless of drag speed or the browser's pointer-event rate.
const TRAIL_SPACING_PX = 12;
// A move event after a stutter (tab switch, a slow frame) can report a
// huge jump in one go — without a cap that would carpet-bomb the whole
// gap with sprinkles in a single frame instead of reading as one skipped
// step of an otherwise-smooth trail.
const TRAIL_MAX_PER_MOVE = 6;

/**
 * Sprinkles dropped along the segment from `from` to `to` — the drag
 * trail itself (see .particle--trail in index.css), called once per
 * pointer-move while a card is being carried (see GameBoard's
 * handleDragMove). Interpolated rather than spawned only at `to` so a
 * fast drag still leaves a continuous-looking trail instead of isolated
 * dots at each move event's endpoint.
 */
export function spawnTrailParticles(
  layer: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const count = Math.min(TRAIL_MAX_PER_MOVE, Math.floor(dist / TRAIL_SPACING_PX));

  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const x = from.x + dx * t + (Math.random() - 0.5) * 6;
    const y = from.y + dy * t + (Math.random() - 0.5) * 6;
    const size = 2 + Math.random() * 3;

    const particle = document.createElement("span");
    particle.className = "particle particle--trail";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    // Mostly falling, not radiating outward like the burst above — dust
    // shaken loose as the card passes settles down, it doesn't scatter.
    particle.style.setProperty("--particle-dx", `${(Math.random() - 0.5) * 10}px`);
    particle.style.setProperty("--particle-dy", `${10 + Math.random() * 14}px`);
    particle.style.setProperty("--particle-size", `${size}px`);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
    layer.appendChild(particle);
  }
}
