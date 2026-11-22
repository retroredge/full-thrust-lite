import { playDiceRattle, playDieLand } from '../audio/sound';
import { svg } from './dom';

/**
 * Six-sided dice drawn as SVG, with pips, and a short tumble before they
 * settle on the rolled faces.
 */

/** Pip positions on a 3 × 3 grid (0 to 2 across and down) for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/** What a die's result meant, which sets its colour. */
export type DieTone = 'plain' | 'miss' | 'hit' | 'double';

/** The die is drawn on a 40-unit grid… */
const SIZE = 40;
/** …and shown this many pixels across. */
const DISPLAY_SIZE = 24;

/** How long the dice tumble before the first one settles. */
const TUMBLE_MS = 500;
/** Time between face changes while tumbling. */
const FACE_CHANGE_MS = 150;
/**
 * Dice thrown together land at slightly different moments: each settles at a
 * random time up to this long after the others start settling.
 */
const SETTLE_SPREAD_MS = 100;

function drawFace(group: SVGGElement, face: number): void {
  group.querySelectorAll('.die-pip').forEach((pip) => pip.remove());
  for (const [column, row] of PIPS[face] ?? []) {
    group.append(
      svg('circle', {
        class: 'die-pip',
        cx: 9 + column * 11,
        cy: 9 + row * 11,
        r: 3.6,
      }),
    );
  }
}

/** One die showing `face`. `colour` tints the body, e.g. a player's colour. */
export function dieElement(face: number, tone: DieTone = 'plain', colour?: string): SVGSVGElement {
  const root = svg('svg', {
    class: `die die-${tone}`,
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    width: DISPLAY_SIZE,
    height: DISPLAY_SIZE,
    role: 'img',
    'aria-label': `Die showing ${face}`,
  });
  const body = svg('g', { class: 'die-body' });
  body.append(
    svg('rect', {
      class: 'die-face',
      x: 1.5,
      y: 1.5,
      width: SIZE - 3,
      height: SIZE - 3,
      rx: 7,
      ...(colour === undefined ? {} : { style: `--die-colour: ${colour}` }),
    }),
  );
  drawFace(body, face);
  root.append(body);
  root.dataset.face = String(face);
  return root;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Tumbles some dice, flicking through random faces, then settles each on the
 * face it was created with. They are thrown together, like a handful of dice:
 * all start at once and land within a moment of each other. Resolves when
 * they have all settled. With `landSound` false they land silently, for a
 * caller that plays its own sound for the result.
 */
export function tumble(dice: readonly SVGSVGElement[], durationMs = TUMBLE_MS, landSound = true): Promise<void> {
  if (dice.length === 0 || prefersReducedMotion()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const settleAt = dice.map(() => durationMs + Math.random() * SETTLE_SPREAD_MS);
    playDiceRattle(Math.max(...settleAt), dice.length);
    for (const die of dice) {
      die.classList.add('die-rolling');
      // Each die spins out of step with the others, some one way and some the other.
      const body = die.querySelector<SVGGElement>('.die-body')!;
      body.style.animationDelay = `${-Math.random() * 900}ms`;
      body.style.animationDirection = Math.random() < 0.5 ? 'normal' : 'reverse';
    }
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      dice.forEach((die, index) => {
        const body = die.querySelector<SVGGElement>('.die-body')!;
        if (elapsed >= settleAt[index]!) {
          if (die.classList.contains('die-rolling')) {
            die.classList.remove('die-rolling');
            drawFace(body, Number(die.dataset.face));
            if (landSound) {
              playDieLand();
            }
          }
        } else {
          drawFace(body, 1 + Math.floor(Math.random() * 6));
        }
      });
      if (dice.every((die) => !die.classList.contains('die-rolling'))) {
        window.clearInterval(timer);
        resolve();
      }
    }, FACE_CHANGE_MS);
  });
}
