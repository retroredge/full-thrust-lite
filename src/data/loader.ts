import { isCourse } from '../rules/course';
import { forceSummary } from './forces';
import { ARCS, SSD_SIZES, type Arc, type Ship, type ShipDesign, type SsdSize } from '../rules/ship';

export interface ScenarioShip {
  id: string;
  design: string;
  name: string;
  x: number;
  y: number;
  course: number;
  velocity: number;
}

export interface ScenarioPlayer {
  id: string;
  name: string;
  colour: string;
  /** The fleet this player's ships come from, e.g. "green": each ship's `design` names a class in `designs/<fleet>/`. */
  fleet: string;
  ships: ScenarioShip[];
}

export interface Scenario {
  id: string;
  /** Position in the scenario list, starting at 1. */
  number: number;
  /** The title shown in the scenario list. */
  name: string;
  /** A short paragraph introducing the scenario, shown on the scenario list. */
  description: string;
  players: ScenarioPlayer[];
}

export class ValidationError extends Error {
  constructor(
    readonly source: string,
    readonly problems: string[],
  ) {
    super(`${source} is not valid:\n- ${problems.join('\n- ')}`);
    this.name = 'ValidationError';
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A lowercase word such as "green" or "light-cruiser", safe to use as a file or folder name. */
function isSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
}

/**
 * The key a design is known by in the designs map and in `Ship.designId`:
 * its fleet and class, e.g. "green/frigate". It is also the design file's
 * path under `designs/`, without ".json".
 */
export function designKey(fleet: string, id: string): string {
  return `${fleet}/${id}`;
}

/** Checks a ship design document and returns it typed. Throws a ValidationError listing every problem. */
export function parseDesign(raw: unknown, source = 'Ship design'): ShipDesign {
  const problems: string[] = [];
  if (!isObject(raw)) {
    throw new ValidationError(source, ['The document must be an object.']);
  }

  for (const field of ['id', 'className', 'sprite'] as const) {
    if (!isText(raw[field])) {
      problems.push(`"${field}" must be a non-empty string.`);
    }
  }
  if (!isSlug(raw.fleet)) {
    problems.push('"fleet" must be a lowercase word, e.g. "red" or "green".');
  }
  if (typeof raw.code !== 'string' || !/^[A-Z]{1,4}$/.test(raw.code)) {
    problems.push('"code" must be 1 to 4 capital letters, e.g. "FF".');
  }
  if (!isFiniteNumber(raw.length) || raw.length <= 0) {
    problems.push('"length" must be a positive number.');
  }

  const drives = Array.isArray(raw.drives) ? raw.drives : [];
  if (drives.length === 0) {
    problems.push('"drives" must list at least one drive.');
  }
  drives.forEach((drive, index) => {
    if (!isObject(drive) || !isPositiveInteger(drive.thrust)) {
      problems.push(`Drive ${index + 1} needs a positive whole-number "thrust".`);
    }
  });

  const hullRows = Array.isArray(raw.hullRows) ? raw.hullRows : [];
  if (hullRows.length === 0 || !hullRows.every(isPositiveInteger)) {
    problems.push('"hullRows" must be a list of positive whole numbers.');
  }

  if (typeof raw.fireControls !== 'number' || !Number.isInteger(raw.fireControls) || raw.fireControls < 0) {
    problems.push('"fireControls" must be a whole number, zero or more.');
  }

  const weapons = Array.isArray(raw.weapons) ? raw.weapons : null;
  if (weapons === null) {
    problems.push('"weapons" must be a list.');
  }
  (weapons ?? []).forEach((weapon, index) => {
    const label = `Weapon ${index + 1}`;
    if (!isObject(weapon)) {
      problems.push(`${label} must be an object.`);
      return;
    }
    if (weapon.type === 'beam') {
      if (!isPositiveInteger(weapon.class) || weapon.class > 3) {
        problems.push(`${label} is a beam and needs a "class" of 1, 2 or 3.`);
      }
    } else if (weapon.type !== 'pulseTorpedo') {
      problems.push(`${label} has an unknown type; use "beam" or "pulseTorpedo".`);
    }
    const arcs = Array.isArray(weapon.arcs) ? weapon.arcs : [];
    if (arcs.length === 0 || !arcs.every((arc) => ARCS.includes(arc as Arc))) {
      problems.push(`${label} needs "arcs" chosen from ${ARCS.join(', ')}.`);
    } else if (arcs.includes('A')) {
      problems.push(`${label} may not fire through the aft (A) arc.`);
    }
  });

  const ssd = raw.ssd;
  if (!isObject(ssd)) {
    problems.push('"ssd" must be an object with a "size" and "weaponRows".');
  } else {
    if (!SSD_SIZES.includes(ssd.size as SsdSize)) {
      problems.push('"ssd.size" must be a whole number from 1 to 5, 1 for the smallest ship.');
    }
    const rows = ssd.weaponRows;
    const weaponCount = weapons?.length ?? 0;
    if (!Array.isArray(rows) || !rows.every((count) => count === 1 || count === 2)) {
      problems.push('"ssd.weaponRows" must list how many weapons are in each row: 1 or 2.');
    } else if (rows.reduce((total: number, count: number) => total + count, 0) !== weaponCount) {
      problems.push(`"ssd.weaponRows" must add up to the ${weaponCount} weapons.`);
    }
  }

  if (problems.length > 0) {
    throw new ValidationError(source, problems);
  }
  return raw as unknown as ShipDesign;
}

/** Checks a scenario document against the available designs and returns it typed. */
export function parseScenario(raw: unknown, designs: ReadonlyMap<string, ShipDesign>, source = 'Scenario'): Scenario {
  const problems: string[] = [];
  if (!isObject(raw)) {
    throw new ValidationError(source, ['The document must be an object.']);
  }
  if (!isText(raw.id)) {
    problems.push('"id" must be a non-empty string.');
  }
  if (!isPositiveInteger(raw.number)) {
    problems.push('"number" must be a whole number, 1 or more.');
  }
  if (!isText(raw.name)) {
    problems.push('"name" must be a non-empty string.');
  }
  if (!isText(raw.description)) {
    problems.push('"description" must be a non-empty string.');
  }

  const players = Array.isArray(raw.players) ? raw.players : [];
  if (players.length < 2) {
    problems.push('"players" must list at least two players.');
  }

  const playerIds = new Set<string>();
  const shipIds = new Set<string>();
  players.forEach((player, playerIndex) => {
    const playerLabel = `Player ${playerIndex + 1}`;
    if (!isObject(player)) {
      problems.push(`${playerLabel} must be an object.`);
      return;
    }
    if (!isText(player.id)) {
      problems.push(`${playerLabel} needs an "id".`);
    } else if (playerIds.has(player.id)) {
      problems.push(`Player id "${player.id}" is used more than once.`);
    } else {
      playerIds.add(player.id);
    }
    if (!isText(player.name)) {
      problems.push(`${playerLabel} needs a "name".`);
    }
    if (!isText(player.colour)) {
      problems.push(`${playerLabel} needs a "colour".`);
    }
    const fleet = isSlug(player.fleet) ? player.fleet : null;
    if (fleet === null) {
      problems.push(`${playerLabel} needs a "fleet", a lowercase word such as "red" or "green".`);
    }
    const ships = Array.isArray(player.ships) ? player.ships : [];
    if (ships.length === 0) {
      problems.push(`${playerLabel} needs at least one ship.`);
    }
    ships.forEach((ship, shipIndex) => {
      const fallback = `${playerLabel} ship ${shipIndex + 1}`;
      if (!isObject(ship)) {
        problems.push(`${fallback} must be an object.`);
        return;
      }
      const label = isText(ship.id) ? `Ship "${ship.id}"` : fallback;
      if (!isText(ship.id)) {
        problems.push(`${fallback} needs an "id".`);
      } else if (shipIds.has(ship.id)) {
        problems.push(`Ship id "${ship.id}" is used more than once.`);
      } else {
        shipIds.add(ship.id);
      }
      if (!isText(ship.name)) {
        problems.push(`${label} needs a "name".`);
      }
      if (!isText(ship.design)) {
        problems.push(`${label} needs a "design".`);
      } else if (fleet !== null && !designs.has(designKey(fleet, ship.design))) {
        problems.push(`${label} uses an unknown design "${ship.design}" for the ${fleet} fleet.`);
      }
      if (!isCourse(ship.course)) {
        problems.push(`${label} needs a "course" from 1 to 12.`);
      }
      if (typeof ship.velocity !== 'number' || !Number.isInteger(ship.velocity) || ship.velocity < 0) {
        problems.push(`${label} needs a whole-number "velocity", zero or more.`);
      }
      if (!isFiniteNumber(ship.x) || !isFiniteNumber(ship.y)) {
        problems.push(`${label} needs numeric "x" and "y" positions.`);
      }
    });
  });

  if (problems.length > 0) {
    throw new ValidationError(source, problems);
  }
  return raw as unknown as Scenario;
}

/** Builds the starting ships for a scenario, with every drive working. */
export function createShips(scenario: Scenario, designs: ReadonlyMap<string, ShipDesign>): Ship[] {
  return scenario.players.flatMap((player) =>
    player.ships.map((entry): Ship => {
      const key = designKey(player.fleet, entry.design);
      const design = designs.get(key);
      if (design === undefined) {
        throw new ValidationError(scenario.name, [
          `Ship "${entry.id}" uses an unknown design "${entry.design}" for the ${player.fleet} fleet.`,
        ]);
      }
      return {
        id: entry.id,
        designId: key,
        playerId: player.id,
        name: entry.name,
        position: { x: entry.x, y: entry.y },
        course: entry.course,
        velocity: entry.velocity,
        drives: design.drives.map((drive) => ({ thrust: drive.thrust, functional: true })),
        hullDamage: 0,
        weaponsLost: [],
        fireControlsLost: [],
      };
    }),
  );
}

/** One entry in the scenario list. */
export interface CatalogueEntry {
  number: number;
  /** The scenario's one-line title. */
  title: string;
  /** A short paragraph introducing the scenario. */
  description: string;
  /** The forces on each side in naval shorthand, e.g. "3 FF vs 2 CL". */
  summary: string;
  scenario: Scenario;
}

export interface Catalogue {
  /** Every scenario, in number order. */
  entries: CatalogueEntry[];
  designs: Map<string, ShipDesign>;
}

/** The scenario ids listed in the scenario index file, in the order given. */
export function parseScenarioIndex(raw: unknown, source = 'Scenario index'): string[] {
  if (!isObject(raw) || !Array.isArray(raw.scenarios) || raw.scenarios.length === 0 || !raw.scenarios.every(isText)) {
    throw new ValidationError(source, ['"scenarios" must list at least one scenario id.']);
  }
  const ids = raw.scenarios as string[];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new ValidationError(source, [`Scenario "${duplicates[0]}" is listed more than once.`]);
  }
  return ids;
}

/**
 * Builds the scenario list from the index and the scenario documents it
 * names. Every scenario is fully checked against the designs, and scenario
 * numbers and ids must be unique.
 *
 * @param rawScenarios the scenario documents, by the id the index lists them under
 */
export function buildCatalogue(
  rawIndex: unknown,
  rawScenarios: ReadonlyMap<string, unknown>,
  designs: Map<string, ShipDesign>,
): Catalogue {
  const ids = parseScenarioIndex(rawIndex);
  const entries = ids.map((id): CatalogueEntry => {
    if (!rawScenarios.has(id)) {
      throw new ValidationError('Scenario index', [`Scenario "${id}" is listed but could not be found.`]);
    }
    const scenario = parseScenario(rawScenarios.get(id), designs, `scenarios/${id}.json`);
    if (scenario.id !== id) {
      throw new ValidationError(`scenarios/${id}.json`, [`"id" is "${scenario.id}" but the file is listed as "${id}".`]);
    }
    return {
      number: scenario.number,
      title: scenario.name,
      description: scenario.description,
      summary: forceSummary(scenario, designs),
      scenario,
    };
  });

  const numbers = entries.map((entry) => entry.number);
  const repeated = numbers.find((number, index) => numbers.indexOf(number) !== index);
  if (repeated !== undefined) {
    throw new ValidationError('Scenario index', [`More than one scenario is number ${repeated}.`]);
  }

  return { entries: [...entries].sort((a, b) => a.number - b.number), designs };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status} ${response.statusText}).`);
  }
  return response.json();
}

/** The design keys (e.g. "green/frigate") a scenario document refers to, read without validating it. */
function designKeysIn(raw: unknown): string[] {
  const keys: string[] = [];
  if (isObject(raw) && Array.isArray(raw.players)) {
    for (const player of raw.players) {
      if (isObject(player) && isSlug(player.fleet) && Array.isArray(player.ships)) {
        for (const ship of player.ships) {
          if (isObject(ship) && isSlug(ship.design)) {
            keys.push(designKey(player.fleet, ship.design));
          }
        }
      }
    }
  }
  return keys;
}

/**
 * Loads the scenario list: the index, every scenario it names, and each ship
 * design those scenarios use. Everything is checked before it is returned.
 * `baseUrl` is the folder that holds the `designs` and `scenarios` folders.
 */
export async function loadCatalogue(baseUrl: string): Promise<Catalogue> {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const rawIndex = await fetchJson(`${root}scenarios/index.json`);
  const ids = parseScenarioIndex(rawIndex, `${root}scenarios/index.json`);

  const rawScenarios = new Map<string, unknown>();
  await Promise.all(
    ids.map(async (id) => {
      rawScenarios.set(id, await fetchJson(`${root}scenarios/${id}.json`));
    }),
  );

  const keys = new Set([...rawScenarios.values()].flatMap(designKeysIn));
  const designs = new Map<string, ShipDesign>();
  await Promise.all(
    [...keys].map(async (key) => {
      const designUrl = `${root}designs/${key}.json`;
      const design = parseDesign(await fetchJson(designUrl), designUrl);
      if (designKey(design.fleet, design.id) !== key) {
        throw new ValidationError(designUrl, [
          `"fleet" and "id" are "${design.fleet}" and "${design.id}", but the file is designs/${key}.json.`,
        ]);
      }
      designs.set(key, design);
    }),
  );

  return buildCatalogue(rawIndex, rawScenarios, designs);
}
