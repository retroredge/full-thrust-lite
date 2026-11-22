import { playHullHit } from '../audio/sound';
import { damageForDie } from '../rules/fire';
import type { DieTone } from './dice';
import { svg } from './dom';
import { DAMAGED_BOX_FILL } from './ssdPanel';

/** Time between hull boxes being crossed off. */
const BOX_INTERVAL_MS = 260;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** How a die is tinted once it lands: grey miss, amber 1 damage, red 2 damage. */
export function toneFor(score: number): DieTone {
  const damage = damageForDie(score);
  return damage === 2 ? 'double' : damage === 1 ? 'hit' : 'miss';
}

/** An eight-pointed burst with a bright core, centred on 0,0, `size` across. */
export function burst(size: number): SVGGElement {
  const outer = size * 0.95;
  const inner = size * 0.42;
  const points = Array.from({ length: 16 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (index / 16) * Math.PI * 2;
    return `${(Math.sin(angle) * radius).toFixed(2)},${(-Math.cos(angle) * radius).toFixed(2)}`;
  }).join(' ');
  const group = svg('g', { class: 'ssd-boom-shape' });
  group.append(
    svg('polygon', { points, fill: '#ff8a1f', stroke: '#ffd25c', 'stroke-width': size * 0.06, 'stroke-linejoin': 'round' }),
    svg('circle', { r: size * 0.36, fill: '#fff3b8' }),
  );
  return group;
}

/**
 * Crosses off hull boxes one at a time from `from` up to `to`: a small
 * explosion flares over each box and fades, leaving it filled black.
 * `onBox` is told the ship's hull damage as each box is filled, so the map
 * can keep up.
 */
export async function animateDamage(
  drawing: SVGSVGElement,
  from: number,
  to: number,
  onBox: (hullDamage: number) => void = () => {},
): Promise<void> {
  const animate = !reducedMotion();
  for (let index = from; index < to; index += 1) {
    const box = drawing.querySelector<SVGRectElement>(`[data-box="${index}"]`);
    if (box === null) {
      onBox(index + 1);
      continue;
    }
    if (!animate) {
      box.setAttribute('fill', DAMAGED_BOX_FILL);
      onBox(index + 1);
      continue;
    }
    const size = Number(box.getAttribute('width'));
    const x = Number(box.getAttribute('x')) + size / 2;
    const y = Number(box.getAttribute('y')) + size / 2;
    const holder = svg('g', { transform: `translate(${x} ${y})`, class: 'ssd-boom' });
    const shape = burst(size * 1.5);
    holder.append(shape);
    drawing.append(holder);
    const flare = shape.animate(
      [
        { transform: 'scale(0.2) rotate(0deg)', opacity: 1 },
        { transform: 'scale(1.15) rotate(20deg)', opacity: 1, offset: 0.35 },
        { transform: 'scale(1.6) rotate(35deg)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    );
    void flare.finished.then(
      () => holder.remove(),
      () => holder.remove(),
    );
    playHullHit();
    await sleep(170);
    box.setAttribute('fill', DAMAGED_BOX_FILL);
    onBox(index + 1);
    await sleep(BOX_INTERVAL_MS - 170);
  }
  if (animate && to > from) {
    await sleep(350);
  }
}
