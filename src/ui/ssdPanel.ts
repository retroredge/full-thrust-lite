import { ARCS, ARC_NAMES, weaponLabel, type Ship, type ShipDesign, type WeaponDesign } from '../rules/ship';
import type { ShipSystem } from '../rules/threshold';
import { h, svg } from './dom';
import { DRIVE_SIZE, FIRE_CONTROL_SIZE, HULL_BOX, WEAPON_SIZE, layoutSsd, outlinePath } from './ssdModel';

const INK = '#0a0a0a';
const BLOCKED_ARC = '#2f86b8';

/**
 * How a weapon is shown during the fire phase:
 * - `fired`: used this turn, faded;
 * - `unavailable`: can't fire now, faded;
 * - `available`: can fire and could be chosen, with a dashed ring;
 * - `selected`: chosen to fire, with a solid ring.
 * The classes are `ssd-weapon-<mark>`, so a mark can be changed in place.
 */
export type WeaponMark = 'fired' | 'selected' | 'available' | 'unavailable';

export interface SsdOptions {
  /** Marks for some of the ship's weapons, by weapon index. */
  weaponMarks?: ReadonlyMap<number, WeaponMark>;
  /** A short label in a tag beside some weapons, e.g. how many dice they roll. */
  weaponBadges?: ReadonlyMap<number, string>;
  /** Tooltips that replace the usual weapon description, by weapon index. */
  weaponTitles?: ReadonlyMap<number, string>;
}

function polar(radius: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians) * radius, y: -Math.cos(radians) * radius };
}

/** One 60-degree segment of a weapon's arc ring, centred on `centreDegrees` clockwise from the top. */
function ringSegment(inner: number, outer: number, centreDegrees: number): string {
  const from = centreDegrees - 30;
  const to = centreDegrees + 30;
  const a = polar(outer, from);
  const b = polar(outer, to);
  const c = polar(inner, to);
  const d = polar(inner, from);
  return `M${a.x} ${a.y} A${outer} ${outer} 0 0 1 ${b.x} ${b.y} L${c.x} ${c.y} A${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;
}

/**
 * A weapon icon as drawn in the rules: a numbered disc (or an asterisk for a
 * pulse torpedo launcher) inside a ring of six segments, one per fire arc.
 * Clear segments are arcs the weapon can fire through; filled ones it cannot.
 */
function weaponIcon(
  weapon: WeaponDesign,
  index: number,
  x: number,
  y: number,
  size: number,
  mark: WeaponMark | undefined,
  badge: string | undefined,
  title: string | undefined,
  lost: boolean,
): SVGGElement {
  const outer = size / 2;
  const inner = outer * 0.62;
  const group = svg('g', {
    transform: `translate(${x} ${y})`,
    'data-weapon': index,
    'data-cross': outer * 1.5,
    'data-ring-r': outer * 1.3,
    'data-ring-y': 0,
    class: mark === undefined ? 'ssd-weapon' : `ssd-weapon ssd-weapon-${mark}`,
  });
  const arcs = weapon.arcs.map((arc) => ARC_NAMES[arc]).join(', ');
  const note = lost ? ' (knocked out)' : mark === 'fired' ? ' (fired this turn)' : '';
  group.append(svg('title', {}, title ?? `${weaponLabel(weapon)}: fires through ${arcs}${note}`));
  // A ring shown for the available and selected marks, and a larger clear
  // disc so small icons are easy to click.
  group.append(
    svg('circle', { class: 'ssd-weapon-hit', r: outer * 1.35, fill: 'transparent' }),
    svg('circle', { class: 'ssd-weapon-ring', r: outer * 1.18, fill: 'none', 'stroke-width': size * 0.11 }),
  );

  ARCS.forEach((arc, index) => {
    group.append(
      svg('path', {
        d: ringSegment(inner, outer, index * 60),
        fill: weapon.arcs.includes(arc) ? '#ffffff' : BLOCKED_ARC,
        stroke: INK,
        'stroke-width': size * 0.035,
        'stroke-linejoin': 'round',
      }),
    );
  });
  group.append(svg('circle', { r: inner, fill: '#ffffff', stroke: INK, 'stroke-width': size * 0.05 }));
  group.append(
    svg(
      'text',
      {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': weapon.type === 'beam' ? inner * 1.5 : inner * 2.1,
        'font-weight': 800,
        'font-family': 'system-ui, sans-serif',
        fill: INK,
        y: weapon.type === 'beam' ? 0 : inner * 0.32,
      },
      weapon.type === 'beam' ? String(weapon.class) : '*',
    ),
  );
  if (badge !== undefined) {
    const badgeSize = size * 0.46;
    const badgeGroup = svg('g', { class: 'ssd-weapon-badge', transform: `translate(${outer * 0.85} ${-outer * 0.85})` });
    badgeGroup.append(
      svg('rect', {
        x: -badgeSize / 2,
        y: -badgeSize / 2,
        width: badgeSize,
        height: badgeSize,
        rx: badgeSize * 0.22,
        fill: '#ffd65c',
        stroke: INK,
        'stroke-width': size * 0.03,
      }),
      svg(
        'text',
        {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': badgeSize * 0.72,
          'font-weight': 800,
          'font-family': 'system-ui, sans-serif',
          fill: INK,
        },
        badge,
      ),
    );
    group.append(badgeGroup);
  }
  if (lost) {
    markLost(group);
  }
  return group;
}

function fireControlIcon(x: number, y: number, size: number, index: number, lost: boolean): SVGGElement {
  const group = svg('g', {
    transform: `translate(${x} ${y})`,
    class: 'ssd-fire-control',
    'data-fire-control': index,
    'data-cross': size * 1.15,
    'data-ring-r': size * 0.95,
    'data-ring-y': 0,
  });
  group.append(
    svg('title', {}, 'Fire control system'),
    svg('rect', {
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size,
      fill: '#ffffff',
      stroke: INK,
      'stroke-width': size * 0.1,
    }),
    svg('circle', { r: size * 0.24, fill: INK }),
  );
  if (lost) {
    markLost(group);
  }
  return group;
}

function cross(size: number): SVGPathElement {
  const half = size / 2;
  return svg('path', {
    class: 'ssd-cross',
    d: `M${-half} ${-half} L${half} ${half} M${half} ${-half} L${-half} ${half}`,
    stroke: '#e0362c',
    'stroke-width': size * 0.14,
    'stroke-linecap': 'round',
  });
}

/** A drive icon: a box holding the thrust rating above a flared nozzle. */
function driveIcon(thrust: number, functional: boolean, x: number, y: number, size: number, index: number): SVGGElement {
  const half = size / 2;
  // The layout position is the centre of the whole icon, box and nozzle together.
  const group = svg('g', {
    transform: `translate(${x} ${y - size * 0.1375})`,
    class: 'ssd-drive',
    'data-drive': index,
    'data-cross': size * 1.1,
    'data-ring-r': half * 1.5,
    'data-ring-y': half * 0.27,
  });
  group.append(
    svg('title', {}, `Drive, thrust ${thrust}`),
    svg('path', {
      d: `M${-half * 0.55} ${half * 0.6} L${half * 0.55} ${half * 0.6} L${half * 0.95} ${half * 1.55} L${-half * 0.95} ${half * 1.55} Z`,
      fill: '#ffffff',
      stroke: INK,
      'stroke-width': size * 0.05,
      'stroke-linejoin': 'round',
    }),
    svg('rect', {
      x: -half,
      y: -half,
      width: size,
      height: size * 0.85,
      fill: '#ffffff',
      stroke: INK,
      'stroke-width': size * 0.06,
    }),
    svg(
      'text',
      {
        y: -half * 0.12,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': size * 0.72,
        'font-weight': 800,
        'font-family': 'system-ui, sans-serif',
        fill: INK,
      },
      String(thrust),
    ),
  );
  if (!functional) {
    markLost(group);
  }
  return group;
}

/** The icon for one of a ship's systems in an SSD drawing, if it has one. */
export function systemIcon(drawing: SVGSVGElement, system: ShipSystem): SVGGElement | null {
  const attribute = { weapon: 'data-weapon', fireControl: 'data-fire-control', drive: 'data-drive' }[system.kind];
  return drawing.querySelector<SVGGElement>(`[${attribute}="${system.index}"]`);
}

/** Shows a system as knocked out: a red cross over it and a note in its tooltip. */
export function markLost(icon: SVGGElement): void {
  if (icon.classList.contains('ssd-lost')) {
    return;
  }
  icon.classList.add('ssd-lost');
  icon.append(cross(Number(icon.dataset.cross ?? 10)));
  const title = icon.querySelector('title');
  if (title !== null && !title.textContent?.includes('knocked out')) {
    title.textContent = `${title.textContent ?? ''} (knocked out)`;
  }
}

/** Fill of a hull box that has been crossed off. */
export const DAMAGED_BOX_FILL = INK;

/**
 * The hull boxes, row by row. The first `damage` boxes, counting along the
 * top row first, are crossed off (filled black). Each box carries its index in
 * `data-box` so damage can be animated onto it.
 */
function hullBoxes(rows: number[], x: number, y: number, box: number, damage: number): SVGGElement {
  const group = svg('g', { class: 'ssd-hull' });
  const total = rows.reduce((sum, count) => sum + count, 0);
  const left = Math.max(0, total - damage);
  group.append(svg('title', {}, `Hull: ${left} of ${total} boxes left, in rows of ${rows.join(', ')}`));
  let index = 0;
  rows.forEach((count, rowIndex) => {
    for (let column = 0; column < count; column += 1) {
      group.append(
        svg('rect', {
          x: x + column * box,
          y: y + rowIndex * box,
          width: box * 0.9,
          height: box * 0.9,
          fill: index < damage ? DAMAGED_BOX_FILL : '#ffffff',
          stroke: INK,
          'stroke-width': box * 0.07,
          'data-box': index,
        }),
      );
      index += 1;
    }
  });
  return group;
}

/** Fill and edge of the hull outline, the light and dark blues of the rules' record sheets. */
const HULL_FILL = '#008cd5';
const HULL_EDGE = '#0d4099';
/** Room around the outline for its edge. */
const MARGIN = 4;

/**
 * The ship systems display as an SVG drawing: the shared hull outline at the
 * design's size, with the system icons laid out on it by `layoutSsd`. The
 * drawing's natural size is its size in pixels; `--ssd-height` lets the CSS
 * shrink every SSD by the same factor when the panel is short.
 */
export function ssdDrawing(ship: Ship, design: ShipDesign, options: SsdOptions = {}): SVGSVGElement {
  const layout = layoutSsd(design);
  const width = layout.width + MARGIN * 2;
  const height = layout.height + MARGIN * 2;

  const root = svg('svg', {
    viewBox: `${-MARGIN} ${-MARGIN} ${width} ${height}`,
    width,
    height,
    style: `--ssd-height: ${height}`,
    role: 'img',
    'aria-label': `Ship systems display for ${design.className} ${ship.id}`,
  });
  root.append(
    svg('path', {
      class: 'ssd-outline',
      d: outlinePath(layout.width, layout.height),
      fill: HULL_FILL,
      stroke: HULL_EDGE,
      'stroke-width': 3.5,
      'stroke-linejoin': 'round',
    }),
  );

  design.weapons.forEach((weapon, index) => {
    const at = layout.weapons[index]!;
    root.append(
      weaponIcon(
        weapon,
        index,
        at.x,
        at.y,
        WEAPON_SIZE,
        options.weaponMarks?.get(index),
        options.weaponBadges?.get(index),
        options.weaponTitles?.get(index),
        ship.weaponsLost.includes(index),
      ),
    );
  });
  layout.fireControls.forEach((at, index) => {
    root.append(fireControlIcon(at.x, at.y, FIRE_CONTROL_SIZE, index, ship.fireControlsLost.includes(index)));
  });
  root.append(hullBoxes(design.hullRows, layout.hull.x, layout.hull.y, HULL_BOX, ship.hullDamage));
  ship.drives.forEach((drive, index) => {
    const at = layout.drives[index]!;
    root.append(driveIcon(drive.thrust, drive.functional, at.x, at.y, DRIVE_SIZE, index));
  });
  return root;
}

/** Draws the ship systems display for the selected ship, or a prompt when nothing is selected. */
export function renderSsd(container: HTMLElement, ship: Ship | null, design: ShipDesign | null, options: SsdOptions = {}): void {
  if (ship === null || design === null) {
    container.replaceChildren(h('p', { class: 'empty' }, 'Select a ship on the map or in the plot to see its systems.'));
    return;
  }
  container.replaceChildren(
    h(
      'div',
      { class: 'ssd-header' },
      h('span', { class: 'ssd-title' }, `${ship.id} · ${ship.name}`),
      h('span', { class: 'ssd-class' }, design.className),
    ),
    h('div', { class: 'ssd-card' }, ssdDrawing(ship, design, options)),
  );
}
