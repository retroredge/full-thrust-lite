import type { CatalogueEntry } from '../data/loader';
import { h } from './dom';

/**
 * Shows the intro screen: the numbered list of scenarios, a box describing
 * the selected scenario (its title, a short paragraph and its forces), and a
 * Play button. The first scenario
 * starts selected. Resolves with the chosen scenario once the player presses
 * Play (or Enter); the screen is then hidden.
 *
 * @param overlay the element the screen is drawn into
 * @param app the game behind it, made inert while the screen is up
 */
export function showIntro(overlay: HTMLElement, app: HTMLElement, entries: readonly CatalogueEntry[]): Promise<CatalogueEntry> {
  if (entries.length === 0) {
    return Promise.reject(new Error('There are no scenarios to play.'));
  }
  let selected = entries[0]!;

  const title = h('h3', { class: 'intro-selected-title' });
  const description = h('p', { class: 'intro-text' });
  const summary = h('p', { class: 'intro-summary' });
  const list = h('div', { class: 'intro-list', role: 'radiogroup', 'aria-labelledby': 'intro-choose' });
  const showSelected = () => {
    title.textContent = selected.title;
    description.textContent = selected.description;
    summary.textContent = selected.summary;
  };

  for (const entry of entries) {
    const input = h('input', {
      type: 'radio',
      name: 'scenario',
      value: String(entry.number),
      checked: entry === selected,
      'aria-describedby': 'intro-details',
    });
    input.addEventListener('change', () => {
      if (input.checked) {
        selected = entry;
        showSelected();
      }
    });
    list.append(
      h(
        'label',
        { class: 'intro-option' },
        input,
        h('span', { class: 'intro-number' }, `${entry.number}.`),
        h('span', { class: 'intro-title' }, entry.title),
      ),
    );
  }
  showSelected();

  const form = h(
    'form',
    { class: 'intro-card', 'aria-labelledby': 'intro-heading' },
    h('h1', { id: 'intro-heading', class: 'intro-heading' }, 'Full Thrust Light'),
    h('p', { class: 'intro-tagline' }, "Turn-based starship combat based on Ground Zero Games' Full Thrust Light tabletop game"),
    h('h2', { id: 'intro-choose' }, 'Choose a scenario'),
    list,
    h(
      'div',
      { id: 'intro-details', class: 'intro-description', 'aria-live': 'polite' },
      title,
      description,
      h('h4', { class: 'intro-forces-heading' }, 'Forces'),
      summary,
    ),
    h('div', { class: 'intro-actions' }, h('button', { type: 'submit', class: 'primary intro-play' }, 'Play')),
  );

  overlay.replaceChildren(form);
  overlay.hidden = false;
  app.inert = true;
  // Focus the selected scenario so the arrow keys move through the list.
  list.querySelector<HTMLInputElement>('input:checked')?.focus();

  return new Promise((resolve) => {
    form.addEventListener('keydown', (event) => {
      // Enter plays from anywhere on the screen, including the list.
      if (event.key === 'Enter') {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      overlay.hidden = true;
      overlay.replaceChildren();
      app.inert = false;
      resolve(selected);
    });
  });
}
