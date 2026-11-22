import {
  playBeam,
  playChime,
  playClick,
  playDiceRattle,
  playDieLand,
  playExplosion,
  playHullHit,
  playSample,
  playSelect,
  playSystemOk,
  playThresholdAlarm,
  playTorpedo,
  setEngineSound,
} from '../audio/sound';
import { showDialog } from './dialog';
import { h } from './dom';

/**
 * A temporary window listing the game's sound effects, each on a button, so
 * they can be judged side by side. Opened from the Debug popup.
 */

interface Effect {
  label: string;
  /** Shown as the button's tooltip. */
  note: string;
  play(): void;
}

interface Group {
  title: string;
  note: string;
  effects: Effect[];
}

const DIGITAL_URL = `${import.meta.env.BASE_URL}sounds/kenney-digital/`;

/** A button for a candidate clip from Kenney's Digital SFX Set. */
const candidate = (label: string, file: string, seconds: number): Effect => ({
  label,
  note: `${file}, ${seconds.toFixed(1)} s`,
  play: () => void playSample(DIGITAL_URL + file),
});

/** How long the engine loop plays for on the board. */
const ENGINE_PREVIEW_MS = 3000;

const after = (ms: number, action: () => void): void => {
  window.setTimeout(action, ms);
};

const GROUPS: Group[] = [
  {
    title: 'In use',
    note: 'The sounds the game plays now.',
    effects: [
      { label: 'Hull hit', note: 'A damage box crossed off: Explosion crunch 1 (Kenney)', play: playHullHit },
      { label: 'Ship destroyed', note: 'Explosion crunch 5 (Kenney), half as loud again', play: playExplosion },
      {
        label: 'Ship movement',
        note: `Thruster 2 (Kenney), looped while ships move: ${ENGINE_PREVIEW_MS / 1000} s here`,
        play: () => {
          setEngineSound(true);
          after(ENGINE_PREVIEW_MS, () => setEngineSound(false));
        },
      },
      {
        label: 'Threshold alarm',
        note: 'A threshold check is about to be rolled: Battle stations, sounded once (generated)',
        play: playThresholdAlarm,
      },
      { label: 'System OK', note: 'A system passes its threshold check (generated)', play: playSystemOk },
      { label: 'Pulse torpedo', note: 'A torpedo launching: Laser 2 (Kenney)', play: playTorpedo },
      { label: 'Class 1 beam', note: 'Generated', play: () => playBeam(1) },
      { label: 'Class 2 beam', note: 'Generated', play: () => playBeam(2) },
      { label: 'Class 3 beam', note: 'Generated', play: () => playBeam(3) },
      {
        label: 'Dice roll',
        note: 'Four dice rattling, then landing (generated)',
        play: () => {
          playDiceRattle(900, 4);
          [900, 980, 1060, 1140].forEach((ms) => after(ms, playDieLand));
        },
      },
      { label: 'Phase chime', note: 'A new phase is announced (generated)', play: playChime },
      { label: 'Weapon chosen', note: 'Clicking a beam or torpedo to fire it (generated)', play: () => playSelect(true) },
      {
        label: 'Weapon held back',
        note: 'Clicking a beam or torpedo to hold it back (generated)',
        play: () => playSelect(false),
      },
      { label: 'Click', note: 'Button presses (generated)', play: playClick },
    ],
  },
  {
    title: 'Beam candidates',
    note: 'From Kenney’s Digital SFX Set (CC0), as alternatives to the generated beams.',
    effects: [
      // Laser 2 is in use for pulse torpedoes.
      ...[1.6, 1.8, 1.9, 1.7, 2.1, 1.2, 1.3, 1.5, 1.2].flatMap((seconds, index) =>
        index === 1 ? [] : [candidate(`Laser ${index + 1}`, `laser${index + 1}.mp3`, seconds)],
      ),
      ...[0.4, 0.4, 0.4, 0.3, 0.2, 0.3, 0.3].map((seconds, index) =>
        candidate(`Phaser up ${index + 1}`, `phaserUp${index + 1}.mp3`, seconds),
      ),
      ...[0.4, 0.3, 0.4].map((seconds, index) => candidate(`Phaser down ${index + 1}`, `phaserDown${index + 1}.mp3`, seconds)),
      candidate('Zap 1', 'zap1.mp3', 0.95),
      candidate('Zap 2', 'zap2.mp3', 1.17),
      candidate('Zap two-tone 1', 'zapTwoTone.mp3', 1.25),
      candidate('Zap two-tone 2', 'zapTwoTone2.mp3', 1.14),
      candidate('Zap three-tone down', 'zapThreeToneDown.mp3', 1.28),
      candidate('Zap three-tone up', 'zapThreeToneUp.mp3', 1.14),
      candidate('Low sweep', 'lowDown.mp3', 0.73),
    ],
  },
];

/** Opens the sound effects window. */
export function showSoundBoard(): void {
  const groups = GROUPS.map((group) =>
    h(
      'section',
      { class: 'sound-group' },
      h('h3', { class: 'sound-group-title' }, group.title),
      h('p', { class: 'sound-group-note' }, group.note),
      h(
        'div',
        { class: 'sound-buttons' },
        ...group.effects.map((effect) => {
          const button = h('button', { type: 'button', class: 'sound-button', title: effect.note }, '▶ ', effect.label);
          button.addEventListener('click', () => effect.play());
          return button;
        }),
      ),
    ),
  );
  const dialog = h(
    'dialog',
    { class: 'game-dialog sound-board', 'aria-labelledby': 'sound-board-title' },
    h(
      'form',
      { method: 'dialog' },
      h('p', { class: 'dialog-eyebrow' }, 'Temporary'),
      h('h2', { id: 'sound-board-title', class: 'dialog-title' }, 'Sound effects'),
      h(
        'p',
        { class: 'dialog-message' },
        'Recorded sounds are from Kenney’s Sci-Fi Sounds and Digital SFX packs (CC0). Hover over a button to see where it comes from.',
      ),
      ...groups,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'primary', value: 'close' }, 'Close')),
    ),
  );
  dialog.addEventListener(
    'close',
    () => {
      setEngineSound(false);
    },
    { once: true },
  );
  void showDialog(dialog, null);
}
