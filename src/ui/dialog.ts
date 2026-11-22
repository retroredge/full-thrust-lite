import { playChime } from '../audio/sound';
import { h } from './dom';

/**
 * Pop-up dialogs that pause the game, built on the native <dialog> element.
 * While one is open the rest of the page can't be used, but stays visible
 * behind a light dim.
 */

export interface AnnounceOptions {
  /** Small line above the title, e.g. "Turn 3". */
  eyebrow?: string;
  title: string;
  subtitle: string;
  /** A further line under the subtitle. */
  detail?: string | undefined;
  /** Instructions for the phase, under the detail. */
  help?: string | undefined;
  /** Accent colour, e.g. the player's colour. */
  colour?: string | null;
  buttonLabel?: string;
  /** Extra content shown above the button, e.g. dice. */
  body?: Node | null;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  colour?: string | null;
  /** Give Cancel the focus instead of the confirm button, so Enter or Space can't confirm by accident. */
  safeDefault?: boolean;
}

let open: HTMLDialogElement | null = null;

/** True while a dialog is showing. */
export function isDialogOpen(): boolean {
  return open !== null;
}

/** Shows a <dialog> modally. Resolves with its return value when it closes, and removes it. */
export function showDialog(dialog: HTMLDialogElement, colour: string | null | undefined): Promise<string> {
  if (colour) {
    dialog.style.setProperty('--dialog-accent', colour);
  }
  document.body.append(dialog);
  open = dialog;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        open = null;
        dialog.remove();
        resolve(dialog.returnValue);
      },
      { once: true },
    );
  });
}

/**
 * Announces the start of a phase. Resolves when the player presses the
 * button, Enter, Space or Escape.
 */
export function announce(options: AnnounceOptions): Promise<void> {
  const button = h('button', { type: 'submit', value: 'ok', class: 'primary', autofocus: true }, options.buttonLabel ?? 'Begin');
  const dialog = h(
    'dialog',
    { class: 'game-dialog announce', 'aria-labelledby': 'dialog-title' },
    h(
      'form',
      { method: 'dialog' },
      options.eyebrow === undefined ? null : h('p', { class: 'dialog-eyebrow' }, options.eyebrow),
      h('h2', { id: 'dialog-title', class: 'dialog-title' }, options.title),
      h('p', { class: 'dialog-subtitle' }, options.subtitle),
      options.detail === undefined ? null : h('p', { class: 'dialog-detail' }, options.detail),
      options.help === undefined ? null : h('p', { class: 'dialog-detail' }, options.help),
      options.body ?? null,
      h('div', { class: 'dialog-actions' }, button),
    ),
  );
  playChime();
  return showDialog(dialog, options.colour).then(() => undefined);
}

/** Asks the player to confirm. Resolves true for the confirm button, false for Cancel or Escape. */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const dialog = h(
    'dialog',
    { class: 'game-dialog confirm', 'aria-labelledby': 'dialog-title' },
    h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'dialog-title', class: 'dialog-title' }, options.title),
      h('p', { class: 'dialog-message' }, options.message),
      h(
        'div',
        { class: 'dialog-actions' },
        h(
          'button',
          { type: 'submit', value: 'cancel', autofocus: options.safeDefault === true },
          options.cancelLabel ?? 'Cancel',
        ),
        h(
          'button',
          { type: 'submit', value: 'confirm', class: 'primary', autofocus: options.safeDefault !== true },
          options.confirmLabel,
        ),
      ),
    ),
  );
  return (await showDialog(dialog, options.colour)) === 'confirm';
}

export interface ChoiceOptions {
  /** Small line above the title, e.g. "Turn 3". */
  eyebrow?: string;
  title: string;
  message: string;
  /** Further paragraphs under the message, e.g. ships leaving the battle. */
  notes?: string[];
  /** The buttons, left to right. The primary one has the focus, unless another is marked `focus`. */
  choices: { value: string; label: string; primary?: boolean; focus?: boolean }[];
  colour?: string | null;
}

/**
 * Offers a choice of what to do next. Resolves with the chosen button's
 * value, or an empty string if the player closes the dialog with Escape.
 */
export function choose(options: ChoiceOptions): Promise<string> {
  const dialog = h(
    'dialog',
    { class: 'game-dialog choice', 'aria-labelledby': 'dialog-title' },
    h(
      'form',
      { method: 'dialog' },
      options.eyebrow === undefined ? null : h('p', { class: 'dialog-eyebrow' }, options.eyebrow),
      h('h2', { id: 'dialog-title', class: 'dialog-title' }, options.title),
      h('p', { class: 'dialog-message' }, options.message),
      ...(options.notes ?? []).map((note) => h('p', { class: 'dialog-message dialog-note' }, note)),
      h(
        'div',
        { class: 'dialog-actions' },
        ...options.choices.map((choice) =>
          h(
            'button',
            {
              type: 'submit',
              value: choice.value,
              class: choice.primary ? 'primary' : undefined,
              autofocus: options.choices.some((other) => other.focus === true) ? choice.focus === true : choice.primary === true,
            },
            choice.label,
          ),
        ),
      ),
    ),
  );
  playChime();
  return showDialog(dialog, options.colour);
}
