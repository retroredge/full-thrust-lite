import { findPlayer, type Player } from '../game/state';
import { BATTLE_AREA_RANGE } from '../rules/battleArea';
import type { Order } from '../rules/orders';
import { h } from './dom';
import type { OrderPanel, TurnResult } from './orderPanelModel';
import {
  formatThrustChange,
  withDirection,
  withThrustChange,
  withTurnPoints,
  type DirectionChoice,
  type PlotRow,
} from './plotModel';

export interface OrderPanelHandlers {
  onOrder(shipId: string, order: Order): void;
}

/** The turn direction choices, in the order they are shown: port, no turn, starboard. */
const DIRECTIONS: { value: DirectionChoice; label: string; title: string }[] = [
  { value: 'P', label: 'P', title: 'Port (anticlockwise)' },
  { value: 'none', label: '–', title: 'No turn' },
  { value: 'S', label: 'S', title: 'Starboard (clockwise)' },
];

/** Port / no turn / starboard as a row of radio buttons. Choices the drives can't make are disabled. */
function directionRadios(plot: PlotRow, onChange: (value: DirectionChoice) => void): HTMLElement {
  const group = h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Turn direction' });
  for (const direction of DIRECTIONS) {
    const input = h('input', {
      type: 'radio',
      name: `turn-direction-${plot.shipId}`,
      value: direction.value,
      checked: plot.direction === direction.value,
      disabled: !plot.directionChoices.includes(direction.value),
      'data-focus': `${plot.shipId}:direction:${direction.value}`,
    });
    input.addEventListener('change', () => {
      if (input.checked) {
        onChange(direction.value);
      }
    });
    group.append(h('label', { title: direction.title }, input, h('span', {}, direction.label)));
  }
  return group;
}

function select(
  options: { value: string; label: string }[],
  current: string,
  attributes: { label: string; focusKey: string; disabled: boolean },
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = h('select', {
    'aria-label': attributes.label,
    'data-focus': attributes.focusKey,
    disabled: attributes.disabled,
  });
  for (const option of options) {
    element.append(h('option', { value: option.value, selected: option.value === current }, option.label));
  }
  element.value = current;
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

/** A label and value pair on one line of the panel. */
function row(label: string, ...value: (Node | string)[]): HTMLElement {
  return h(
    'div',
    { class: 'order-row' },
    h('span', { class: 'order-label' }, label),
    h('span', { class: 'order-value' }, ...value),
  );
}

function vc(velocity: number, course: number, changed = false): HTMLElement {
  return h(
    'span',
    { class: `vc-pair${changed ? ' changed' : ''}` },
    'V ',
    h('strong', {}, String(velocity)),
    '  C ',
    h('strong', {}, String(course)),
  );
}

function turnResult(result: TurnResult): (HTMLElement | string)[] {
  return [h('span', { class: 'order-text' }, result.order), ' → ', vc(result.velocity, result.course)];
}

/** The inputs for a ship's orders. They only offer values the ship's working drives allow. */
function editRows(plot: PlotRow, velocity: number, course: number, handlers: OrderPanelHandlers): HTMLElement[] {
  const shipId = plot.shipId;
  if (plot.lockedReason !== null) {
    return [row('Orders', h('span', { class: 'empty' }, `${plot.lockedReason}: the ship coasts.`))];
  }
  return [
    row(
      'Thrust',
      select(
        plot.thrustChoices.map((value) => ({ value: String(value), label: formatThrustChange(value) })),
        String(plot.order.thrustChange),
        { label: 'Thrust change', focusKey: `${shipId}:thrust`, disabled: false },
        (value) => handlers.onOrder(shipId, withThrustChange(plot.order, Number(value))),
      ),
    ),
    row(
      'Turn',
      directionRadios(plot, (value) => handlers.onOrder(shipId, withDirection(plot.order, value))),
      select(
        plot.pointChoices.length > 0
          ? plot.pointChoices.map((value) => ({ value: String(value), label: String(value) }))
          : [{ value: '0', label: '0' }],
        String(plot.order.turnPoints),
        { label: 'Turn points', focusKey: `${shipId}:points`, disabled: plot.pointChoices.length === 0 },
        (value) => handlers.onOrder(shipId, withTurnPoints(plot.order, Number(value))),
      ),
    ),
    row('Result', vc(plot.newVelocity, plot.newCourse, plot.newVelocity !== velocity || plot.newCourse !== course)),
    row(
      'Thrust used',
      h(
        'span',
        { title: `At most ${plot.maxTurn} thrust points may be used to turn.` },
        `${plot.thrustUsed} of ${plot.thrustAvailable}`,
        h('span', { class: 'muted' }, ` · turn up to ${plot.maxTurn}`),
      ),
    ),
  ];
}

/**
 * Draws the movement orders for the selected ship: inputs for one of the
 * plotting player's own ships, and read-only information otherwise. Another
 * player's orders for this turn are never shown until the ships move.
 */
export function renderOrderPanel(
  container: HTMLElement,
  panel: OrderPanel,
  players: readonly Player[],
  handlers: OrderPanelHandlers,
): void {
  const active = document.activeElement;
  const focusKey = active instanceof HTMLElement && container.contains(active) ? active.dataset.focus : undefined;

  if (panel.kind === 'none') {
    container.replaceChildren(h('p', { class: 'empty' }, 'Select a ship to see or plot its orders.'));
    return;
  }

  const owner = findPlayer({ players }, panel.playerId);
  const rows: HTMLElement[] = [row('Now', vc(panel.velocity, panel.course))];

  if (panel.kind === 'edit') {
    rows.push(...editRows(panel.plot, panel.velocity, panel.course, handlers));
  } else if (panel.kind === 'secret') {
    rows.push(
      row(
        'This turn',
        h(
          'span',
          { class: 'secret', title: "Another player's orders stay secret until the ships move" },
          panel.lockedIn ? `${owner?.name ?? 'Orders'} locked in` : `${owner?.name ?? 'Orders'} not plotted yet`,
        ),
      ),
    );
  } else {
    rows.push(row(panel.moved ? 'This turn' : 'Moving', ...turnResult(panel.thisTurn)));
  }
  if (panel.lastTurn !== null && panel.kind !== 'result') {
    rows.push(row('Last turn', ...turnResult(panel.lastTurn)));
  }
  if (panel.leaving) {
    rows.push(
      row(
        'Leaving',
        h(
          'span',
          { class: 'leaving-note' },
          `No enemy ship within ${BATTLE_AREA_RANGE} mu. ${panel.shipId} leaves the battle after the next move unless it ends within ${BATTLE_AREA_RANGE} mu of one.`,
        ),
      ),
    );
  }

  container.replaceChildren(...rows);

  if (focusKey !== undefined) {
    container.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  }
}
