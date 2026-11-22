import { playHullHit, playSystemOk, playThresholdAlarm } from '../audio/sound';
import type { ThresholdCheck } from '../game/fire';
import { dieElement, tumble } from './dice';
import { h, svg } from './dom';
import { burst, reducedMotion, sleep } from './fireEffects';
import { markLost, systemIcon } from './ssdPanel';
import { thresholdGroups } from './thresholdModel';
import { plural } from '../text';

/**
 * Plays out a threshold check on the target's SSD: the alarm sounds, then
 * the working systems are checked a group at a time, all the weapons, then
 * all the fire controls, then all the drives. Every system in the group is
 * ringed and its own die rolls beside its name under the SSD, all at once. A
 * system that fails is crossed off in red with an explosion.
 */

/** How long the alarm sounds before the first system is checked. */
const ALARM_MS = 800;
/** How long a group's dice tumble. */
const GROUP_TUMBLE_MS = 600;
/** Gap between the explosions when a group loses more than one system. */
const LOSS_STAGGER_MS = 120;
/** Pause after a group's results before the next group. */
const AFTER_GROUP_MS = 400;
/** One turn of the checking ring's pulse. */
const RING_PULSE_MS = 900;

/** "Threshold check: row 2 crossed off. Systems are lost on 1–2." and the like. */
export function thresholdSummary(check: Pick<ThresholdCheck, 'row' | 'rows' | 'failOn'>): string {
  const crossed =
    check.rows > 1 ? `rows ${check.row - check.rows + 1}–${check.row} crossed off at once (+1)` : `row ${check.row} crossed off`;
  const failOn = Math.min(6, check.failOn);
  const lostOn = failOn === 1 ? 'a 1' : `1–${failOn}`;
  return `${crossed}. Systems are lost on ${lostOn}.`;
}

/** A dotted yellow ring that pulses around the system being checked. */
function checkingRing(icon: SVGGElement, animate: boolean): SVGCircleElement {
  const radius = Number(icon.dataset.ringR ?? 6);
  const dash = radius * 0.28;
  const gap = radius * 0.2;
  const ring = svg('circle', {
    class: 'ssd-checking-ring',
    cy: Number(icon.dataset.ringY ?? 0),
    r: radius,
    'stroke-width': radius * 0.13,
    'stroke-dasharray': `${dash} ${gap}`,
  });
  icon.append(ring);
  if (animate) {
    ring.animate(
      [
        { strokeDashoffset: '0', opacity: 1 },
        { opacity: 0.4, offset: 0.5 },
        { strokeDashoffset: String(-(dash + gap) * 2), opacity: 1 },
      ],
      { duration: RING_PULSE_MS, iterations: Infinity },
    );
  }
  return ring;
}

/** An explosion flaring over a system as it is knocked out, drawn on top of the whole SSD so nothing covers it. */
function flare(drawing: SVGSVGElement, icon: SVGGElement): void {
  const radius = Number(icon.dataset.ringR ?? 6);
  const at = `${icon.getAttribute('transform') ?? ''} translate(0 ${Number(icon.dataset.ringY ?? 0)})`;
  const holder = svg('g', { transform: at, class: 'ssd-boom' });
  const shape = burst(radius * 1.6);
  holder.append(shape);
  drawing.append(holder);
  const animation = shape.animate(
    [
      { transform: 'scale(0.2) rotate(0deg)', opacity: 1 },
      { transform: 'scale(1.15) rotate(20deg)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1.6) rotate(35deg)', opacity: 0 },
    ],
    { duration: 560, easing: 'ease-out' },
  );
  void animation.finished.then(
    () => holder.remove(),
    () => holder.remove(),
  );
}

/**
 * Runs a threshold check on `drawing` (the target's SSD), listing each
 * system's roll in `container`. Resolves once every system has been checked.
 */
export async function animateThreshold(drawing: SVGSVGElement, check: ThresholdCheck, container: HTMLElement): Promise<void> {
  const animate = !reducedMotion();
  const list = h('ol', { class: 'threshold-list' });
  const outcome = h('p', { class: 'threshold-outcome' });
  container.replaceChildren(
    h('p', { class: 'threshold-heading' }, h('strong', {}, 'Threshold check: '), thresholdSummary(check)),
    list,
    outcome,
  );
  container.hidden = false;
  if (animate) {
    playThresholdAlarm();
    await sleep(ALARM_MS);
  }

  for (const group of thresholdGroups(check.rolls)) {
    // Every system in the group is ringed and rolls its own die, all together.
    const checks = group.rolls.map((roll) => {
      const icon = systemIcon(drawing, roll.system);
      const die = dieElement(roll.roll, roll.lost ? 'double' : 'miss');
      const verdict = h('span', { class: 'threshold-verdict' });
      const row = h('li', { class: 'threshold-row rolling' }, h('span', { class: 'threshold-system' }, roll.label), die, verdict);
      return { roll, icon, ring: icon === null ? null : checkingRing(icon, animate), die, verdict, row };
    });
    list.append(...checks.map((item) => item.row));
    checks[0]?.row.scrollIntoView({ block: 'nearest' });
    if (animate) {
      // The dice land silently: the results have their own sounds, a ping for a pass and an explosion for a loss.
      await tumble(
        checks.map((item) => item.die),
        GROUP_TUMBLE_MS,
        false,
      );
    }

    for (const { roll, row, verdict } of checks) {
      row.classList.remove('rolling');
      row.classList.add(roll.lost ? 'threshold-lost' : 'threshold-ok');
      verdict.textContent = roll.lost ? 'knocked out' : 'OK';
    }
    if (animate && checks.some((item) => !item.roll.lost)) {
      playSystemOk();
    }
    let losses = 0;
    for (const { roll, icon } of checks) {
      if (!roll.lost) {
        continue;
      }
      if (animate) {
        if (losses > 0) {
          await sleep(LOSS_STAGGER_MS);
        }
        playHullHit();
        if (icon !== null) {
          flare(drawing, icon);
        }
      }
      if (icon !== null) {
        markLost(icon);
      }
      losses += 1;
    }
    if (animate) {
      await sleep(AFTER_GROUP_MS);
    }
    for (const { ring } of checks) {
      ring?.remove();
    }
  }

  const lost = check.rolls.filter((roll) => roll.lost).length;
  outcome.textContent = lost === 0 ? 'No systems lost.' : `${lost} ${plural(lost, 'system')} knocked out.`;
  outcome.classList.toggle('threshold-lost', lost > 0);
}
