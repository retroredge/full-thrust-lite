import {
  canFire,
  finishShip,
  fireControlsLeft,
  fireRecord,
  pass,
  shipsAbleToFire,
  validTargets,
  weaponBearings,
} from '../game/fire';
import { designOf, findPlayer, findShip, playerName, type GameState } from '../game/state';
import { firingArcs } from '../rules/fire';
import { weaponLabel } from '../rules/ship';
import { listOf, plural } from '../text';

/**
 * What a weapon can do right now:
 * - `ready`: an unfired beam or torpedo with a ship it can fire at now;
 * - `noTarget`: an unfired beam or torpedo with no enemy in range and arc;
 * - `noFireControl`: an enemy is in reach, but the ship has used all its fire controls;
 * - `engaged`: the only enemies in reach are ones the ship has already fired at;
 * - `unused`: not fired, and the ship has finished firing (or the phase is over);
 * - `fired`: already fired this turn;
 * - `knockedOut`: lost to a threshold check, and never fires again.
 */
export type WeaponStatus = 'ready' | 'noTarget' | 'noFireControl' | 'engaged' | 'unused' | 'fired' | 'knockedOut';

export interface WeaponRow {
  index: number;
  label: string;
  /** Usable arcs, e.g. "FP F FS". */
  arcs: string;
  status: WeaponStatus;
}

/**
 * What the weapons fire panel shows for the selected ship.
 * `firing` is true when the ship belongs to the player whose go it is.
 */
export type FirePanel =
  | { kind: 'none'; prompt: string }
  | {
      kind: 'ship';
      shipId: string;
      shipName: string;
      firing: boolean;
      fireControlsLeft: number;
      fireControls: number;
      weapons: WeaponRow[];
      prompt: string;
    };

export function buildFirePanel(state: GameState, shipId: string | null): FirePanel {
  const phase = state.phase;
  const firingPlayerId = phase.kind === 'firing' ? phase.playerId : null;
  const firingPlayer = firingPlayerId === null ? undefined : findPlayer(state, firingPlayerId);
  const ship = shipId === null ? undefined : findShip(state, shipId);
  if (ship === undefined) {
    const prompt =
      firingPlayer === undefined
        ? 'Select a ship to see its weapons.'
        : `${firingPlayer.name}: select one of your ships to fire with it.`;
    return { kind: 'none', prompt };
  }
  const design = designOf(state, ship);
  const record = fireRecord(state, ship.id);
  const enemies = state.ships.filter((other) => other.playerId !== ship.playerId);
  const reaching = (targets: readonly (typeof enemies)[number][]) =>
    new Set(
      targets.flatMap((enemy) =>
        weaponBearings(state, ship, enemy).flatMap((bearing, index) => (bearing.kind === 'ok' ? [index] : [])),
      ),
    );
  // Weapons that reach any enemy, and those that reach one not yet fired at.
  const reachable = reaching(enemies);
  const reachableNew = reaching(enemies.filter((enemy) => !record.targets.includes(enemy.id)));
  const outOfFireControl = fireControlsLeft(state, ship) === 0;
  const stillFiring = phase.kind === 'firing' && !record.done;
  const weapons = design.weapons.map((weapon, index): WeaponRow => {
    let status: WeaponStatus;
    if (ship.weaponsLost.includes(index)) {
      status = 'knockedOut';
    } else if (record.weaponsFired.includes(index)) {
      status = 'fired';
    } else if (!reachable.has(index)) {
      status = 'noTarget';
    } else if (outOfFireControl) {
      status = 'noFireControl';
    } else if (!stillFiring) {
      status = 'unused';
    } else if (reachableNew.has(index)) {
      status = 'ready';
    } else {
      status = 'engaged';
    }
    return { index, label: weaponLabel(weapon), arcs: firingArcs(weapon).join(' '), status };
  });

  const firing = firingPlayerId === ship.playerId;
  const active = phase.kind === 'firing' ? phase.activeShipId : null;
  const mayFireNow = firing && canFire(state, ship.id) && (active === null || active === ship.id);

  let prompt: string;
  if (phase.kind !== 'firing') {
    prompt = 'Weapons fire is over for this turn.';
  } else if (!firing) {
    prompt = `${firingPlayer?.name ?? 'The other player'} is firing.`;
  } else if (active !== null && active !== ship.id) {
    prompt = `Finish firing ${active} first.`;
  } else if (record.done) {
    prompt = `${ship.id} has finished firing this turn.`;
  } else if (mayFireNow) {
    prompt = 'Click a ringed enemy ship on the map to fire at it.';
  } else if (active === ship.id) {
    prompt = `${ship.id} has nothing left it can fire at.`;
  } else {
    prompt = `No enemy ship is in range and arc of ${ship.id}.`;
  }

  return {
    kind: 'ship',
    shipId: ship.id,
    shipName: ship.name,
    firing,
    fireControlsLeft: fireControlsLeft(state, ship),
    fireControls: design.fireControls,
    weapons,
    prompt,
  };
}

/** A confirmation shown before a player passes or finishes a ship. */
export interface FireWarning {
  title: string;
  message: string;
}

/**
 * The confirmation shown before a player passes their go: which of their
 * ships could still fire, and what passing means. If the other side passes
 * too (or has already, or has nothing left to fire), firing ends and those
 * ships won't fire this turn; if the other side fires, it's this player's go
 * again.
 */
export function passWarning(state: GameState, playerId: string): FireWarning {
  const name = (id: string) => playerName(state, id);
  const ships = shipsAbleToFire(state, playerId).map((ship) => ship.id);
  const could =
    ships.length === 0 ? 'None of your ships can fire.' : `${listOf(ships)} ${plural(ships.length, 'can', 'could')} still fire.`;
  const next = pass(state, playerId);
  let after: string;
  if (next.phase.kind === 'firing') {
    const other = name(next.phase.playerId);
    after =
      ships.length === 0
        ? `${other} fires next.`
        : `${other} fires next. If ${other} passes too, weapons fire ends and your ships won't fire this turn. If ${other} fires, it's your go again.`;
  } else {
    const others = state.players.filter((player) => player.id !== playerId);
    const passes = state.fire?.passes ?? [];
    const why = others
      .map((player) =>
        passes.includes(player.id) ? `${player.name} has already passed` : `${player.name} has nothing left to fire`,
      )
      .join(' and ');
    after =
      ships.length === 0
        ? `${why}, so weapons fire ends now.`
        : `${why}, so weapons fire ends now and ${plural(ships.length, 'it', 'they')} won't fire this turn.`;
  }
  return { title: `Pass, ${name(playerId)}?`, message: `${could} ${after}` };
}

/**
 * The confirmation shown before a player finishes the ship that is part-way
 * through firing: what it could still fire at, and who fires next.
 */
export function finishShipWarning(state: GameState, playerId: string): FireWarning {
  const phase = state.phase;
  const shipId = phase.kind === 'firing' ? phase.activeShipId : null;
  const ship = shipId === null ? undefined : findShip(state, shipId);
  if (ship === undefined) {
    return { title: 'Finish firing?', message: 'No ship is part-way through firing.' };
  }
  const name = (id: string) => playerName(state, id);
  const left = fireControlsLeft(state, ship);
  const targets = validTargets(state, ship).map((target) => target.id);
  const could =
    targets.length === 0
      ? `${ship.id} has nothing left it can fire at.`
      : `${ship.id} has ${left} ${plural(left, 'fire control')} left and could still fire at ${listOf(targets)}. It won't fire again this turn.`;
  const next = finishShip(state, playerId);
  const after = next.phase.kind === 'firing' ? `${name(next.phase.playerId)} fires next.` : 'Then weapons fire is over.';
  return { title: `Finish firing ${ship.id}?`, message: `${could} ${after}` };
}
