import { h } from './dom';
import type { FirePanel, WeaponStatus } from './firePanelModel';

const STATUS_TEXT: Record<WeaponStatus, string> = {
  ready: 'ready',
  noTarget: 'nothing in reach',
  noFireControl: 'no fire control left',
  engaged: 'target already fired at',
  unused: 'not fired',
  fired: 'fired',
  knockedOut: 'knocked out',
};

function row(label: string, ...value: (Node | string)[]): HTMLElement {
  return h(
    'div',
    { class: 'order-row' },
    h('span', { class: 'order-label' }, label),
    h('span', { class: 'order-value' }, ...value),
  );
}

/** Draws the weapons fire panel for the selected ship. */
export function renderFirePanel(container: HTMLElement, panel: FirePanel): void {
  if (panel.kind === 'none') {
    container.replaceChildren(h('p', { class: 'empty' }, panel.prompt));
    return;
  }

  const rows: HTMLElement[] = [
    row('Fire control', `${panel.fireControlsLeft} of ${panel.fireControls} left`),
    row(
      'Weapons',
      h(
        'ul',
        { class: 'fire-weapons' },
        ...panel.weapons.map((weapon) =>
          h(
            'li',
            { class: `fire-weapon fire-weapon-${weapon.status}`, title: `Fires through ${weapon.arcs || 'no arcs'}` },
            h('span', {}, weapon.label),
            h('span', { class: 'fire-weapon-status' }, STATUS_TEXT[weapon.status]),
          ),
        ),
      ),
    ),
  ];
  rows.push(h('p', { class: 'fire-prompt' }, panel.prompt));
  container.replaceChildren(...rows);
}
