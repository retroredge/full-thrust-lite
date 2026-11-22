import type { Announcement } from '../game/announcements';
import type { InitiativeRound } from '../game/fire';
import type { Player } from '../game/state';
import { dieElement, tumble } from './dice';
import { announce } from './dialog';
import { h } from './dom';

/**
 * The start of the fire phase: each player's initiative die, rolled on
 * screen, with any tied rounds before the deciding one, then who fires first
 * and a short note on how firing works.
 * That is usually the winner, but if none of the winner's ships can reach an
 * enemy, `firstToFire` is the other player and the dialog says so.
 */
export async function announceInitiative(
  players: readonly Player[],
  rounds: readonly InitiativeRound[],
  winner: Player,
  firstToFire: Player,
  announcement: Announcement,
): Promise<void> {
  const dice: SVGSVGElement[] = [];
  const body = h('div', { class: 'initiative' });
  rounds.forEach((round, index) => {
    const tied = index < rounds.length - 1;
    const row = h('div', { class: `initiative-round${tied ? ' initiative-tied' : ''}` });
    for (const player of players) {
      const face = round[player.id];
      if (face === undefined) {
        continue;
      }
      const die = dieElement(face, 'plain', player.colour);
      dice.push(die);
      row.append(h('div', { class: 'initiative-roll' }, die, h('span', { style: `color: ${player.colour}` }, player.name)));
    }
    if (tied) {
      row.append(h('span', { class: 'initiative-note' }, 'Tie — roll again'));
    }
    body.append(row);
  });
  // e.g. " — 6 beats 1": the highest roll wins.
  const last = rounds.at(-1) ?? {};
  const losing = players
    .filter((player) => player.id !== winner.id && last[player.id] !== undefined)
    .map((player) => last[player.id]!);
  const deciding = last[winner.id] === undefined || losing.length === 0 ? '' : ` — ${last[winner.id]} beats ${losing.join(', ')}`;
  const outcome = h(
    'div',
    { hidden: true },
    h('p', { class: 'initiative-winner' }, `${winner.name} has the initiative${deciding}`),
    firstToFire.id === winner.id
      ? null
      : h(
          'p',
          { class: 'initiative-first', style: `color: ${firstToFire.colour}` },
          `…but none of ${winner.name}'s ships can reach an enemy, so ${firstToFire.name} fires first.`,
        ),
    announcement.help === undefined ? null : h('p', { class: 'dialog-detail' }, announcement.help),
  );
  body.append(outcome);

  const closed = announce({
    eyebrow: `Turn ${announcement.turn}`,
    title: announcement.title,
    subtitle: 'Rolling for initiative: highest fires first',
    // The outcome lines explain any automatic pass, so the usual note isn't needed.
    detail: firstToFire.id === winner.id ? announcement.detail : undefined,
    colour: winner.colour,
    body,
  });
  await tumble(dice);
  outcome.hidden = false;
  await closed;
}
