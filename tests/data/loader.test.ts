import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ValidationError,
  buildCatalogue,
  createShips,
  designKey,
  loadCatalogue,
  parseDesign,
  parseScenario,
  parseScenarioIndex,
  type Scenario,
} from '../../src/data/loader';
import { canFire, startFirePhase } from '../../src/game/fire';
import { createGame, lockInOrders, resolveMovement } from '../../src/game/state';
import { isCourse } from '../../src/rules/course';
import type { ShipDesign } from '../../src/rules/ship';

type Doc = Record<string, any>;

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../public/data/${path}`, import.meta.url), 'utf8'));

const validDesign = (): Doc => ({
  id: 'frigate',
  fleet: 'red',
  className: 'Frigate',
  code: 'FF',
  sprite: 'ships/ship.png',
  length: 2.5,
  drives: [{ thrust: 3 }, { thrust: 3 }],
  hullRows: [2, 2],
  fireControls: 1,
  weapons: [
    { type: 'beam', class: 2, arcs: ['FP', 'F', 'FS'] },
    { type: 'pulseTorpedo', arcs: ['F'] },
  ],
  ssd: { size: 1, weaponRows: [2] },
});

const designMap = (...designs: ShipDesign[]) => new Map(designs.map((design) => [designKey(design.fleet, design.id), design]));

const frigates = () => designMap(parseDesign(validDesign()));

const validScenario = (): Doc => ({
  id: 'skirmish',
  number: 1,
  name: 'Skirmish',
  description: 'A short skirmish.',
  players: [
    {
      id: 'red',
      name: 'Red',
      colour: '#ff0000',
      fleet: 'red',
      ships: [{ id: 'R1', design: 'frigate', name: 'Ruby', x: 5, y: 5, course: 3, velocity: 4 }],
    },
    {
      id: 'blue',
      name: 'Blue',
      colour: '#0000ff',
      fleet: 'red',
      ships: [{ id: 'B1', design: 'frigate', name: 'Sapphire', x: 35, y: 25, course: 9, velocity: 0 }],
    },
  ],
});

/** Runs `parse` and returns the problems from the ValidationError it must throw. */
function problemsFrom(parse: () => unknown): string[] {
  try {
    parse();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).problems;
  }
  throw new Error('Expected a ValidationError but nothing was thrown.');
}

function expectProblem(problems: string[], pattern: RegExp) {
  expect(
    problems.some((problem) => pattern.test(problem)),
    `problems were: ${JSON.stringify(problems)}`,
  ).toBe(true);
}

describe('parseDesign', () => {
  it('accepts a valid design and returns it', () => {
    const raw = validDesign();
    const design = parseDesign(raw);
    expect(design.id).toBe('frigate');
    expect(design.drives).toEqual([{ thrust: 3 }, { thrust: 3 }]);
    expect(design.weapons).toHaveLength(2);
  });

  it('accepts a design with no weapons when the layout has no weapon positions', () => {
    const raw = validDesign();
    raw.weapons = [];
    raw.ssd.weaponRows = [];
    expect(() => parseDesign(raw)).not.toThrow();
  });

  it('rejects something that is not an object', () => {
    for (const raw of [null, 42, 'design', []]) {
      expectProblem(
        problemsFrom(() => parseDesign(raw)),
        /must be an object/,
      );
    }
  });

  const rejections: [string, (doc: Doc) => void, RegExp][] = [
    ['a missing id', (doc) => delete doc.id, /"id"/],
    ['a missing fleet', (doc) => delete doc.fleet, /"fleet"/],
    ['a fleet with a capital letter', (doc) => (doc.fleet = 'Red'), /"fleet"/],
    ['a fleet with a slash', (doc) => (doc.fleet = 'red/green'), /"fleet"/],
    ['a blank className', (doc) => (doc.className = '  '), /"className"/],
    ['a missing code', (doc) => delete doc.code, /"code"/],
    ['a lower-case code', (doc) => (doc.code = 'ff'), /"code"/],
    ['a code that is too long', (doc) => (doc.code = 'FRIGT'), /"code"/],
    ['a missing sprite', (doc) => delete doc.sprite, /"sprite"/],
    ['a zero length', (doc) => (doc.length = 0), /"length"/],
    ['zero drives', (doc) => (doc.drives = []), /"drives" must list at least one drive/],
    ['a drive with zero thrust', (doc) => (doc.drives[1].thrust = 0), /Drive 2/],
    ['a drive with fractional thrust', (doc) => (doc.drives[0].thrust = 1.5), /Drive 1/],
    ['no hull rows', (doc) => (doc.hullRows = []), /"hullRows"/],
    ['a zero hull row', (doc) => (doc.hullRows = [2, 0]), /"hullRows"/],
    ['negative fire controls', (doc) => (doc.fireControls = -1), /"fireControls"/],
    ['weapons that are not a list', (doc) => (doc.weapons = 'beam'), /"weapons" must be a list/],
    ['a beam of class 4', (doc) => (doc.weapons[0].class = 4), /Weapon 1 .*class/],
    ['a beam of class 0', (doc) => (doc.weapons[0].class = 0), /Weapon 1 .*class/],
    ['a beam with no class', (doc) => delete doc.weapons[0].class, /Weapon 1 .*class/],
    ['an unknown weapon type', (doc) => (doc.weapons[1].type = 'laser'), /Weapon 2 has an unknown type/],
    ['a weapon with no arcs', (doc) => (doc.weapons[0].arcs = []), /Weapon 1 needs "arcs"/],
    ['a weapon with an unknown arc', (doc) => (doc.weapons[0].arcs = ['F', 'X']), /Weapon 1 needs "arcs"/],
    ['a weapon with the aft arc', (doc) => (doc.weapons[1].arcs = ['F', 'A']), /Weapon 2 .*aft \(A\) arc/],
    ['a missing ssd', (doc) => delete doc.ssd, /"ssd" must be an object/],
    ['an ssd size of 6', (doc) => (doc.ssd.size = 6), /"ssd\.size" must be a whole number from 1 to 5/],
    ['an ssd size given as text', (doc) => (doc.ssd.size = 'large'), /"ssd\.size" must be a whole number from 1 to 5/],
    ['weapon rows that are not a list', (doc) => (doc.ssd.weaponRows = 2), /"ssd\.weaponRows" must list/],
    ['a weapon row of 3', (doc) => (doc.ssd.weaponRows = [3]), /"ssd\.weaponRows" must list/],
    ['a weapon row of 0', (doc) => (doc.ssd.weaponRows = [0, 2]), /"ssd\.weaponRows" must list/],
    [
      'weapon rows holding too few weapons',
      (doc) => (doc.ssd.weaponRows = [1]),
      /"ssd\.weaponRows" must add up to the 2 weapons/,
    ],
    ['weapon rows holding too many weapons', (doc) => (doc.ssd.weaponRows = [2, 1]), /add up to the 2 weapons/],
  ];

  for (const [fault, breakIt, pattern] of rejections) {
    it(`rejects ${fault}`, () => {
      const raw = validDesign();
      breakIt(raw);
      expectProblem(
        problemsFrom(() => parseDesign(raw)),
        pattern,
      );
    });
  }

  it('lists every problem at once and names the source', () => {
    const raw = validDesign();
    delete raw.id;
    raw.weapons[0].class = 4;
    raw.ssd.size = 0;
    let caught: unknown;
    try {
      parseDesign(raw, 'frigate.json');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const error = caught as ValidationError;
    expect(error.problems).toHaveLength(3);
    expect(error.source).toBe('frigate.json');
    expect(error.message).toContain('frigate.json');
    expect(error.name).toBe('ValidationError');
  });
});

describe('parseScenario', () => {
  it('accepts a valid scenario and returns it', () => {
    const scenario = parseScenario(validScenario(), frigates());
    expect(scenario.name).toBe('Skirmish');
    expect(scenario.players).toHaveLength(2);
  });

  it('accepts ships anywhere on the plane, including negative positions', () => {
    const raw = validScenario();
    Object.assign(raw.players[0].ships[0], { x: -250, y: -0.5 });
    Object.assign(raw.players[1].ships[0], { x: 1000, y: 0 });
    expect(() => parseScenario(raw, frigates())).not.toThrow();
  });

  it('rejects something that is not an object', () => {
    expectProblem(
      problemsFrom(() => parseScenario([], frigates())),
      /must be an object/,
    );
  });

  const rejections: [string, (doc: Doc) => void, RegExp][] = [
    ['a missing id', (doc) => delete doc.id, /"id"/],
    ['a missing name', (doc) => (doc.name = ''), /"name"/],
    ['a missing number', (doc) => delete doc.number, /"number"/],
    ['a missing description', (doc) => delete doc.description, /"description"/],
    ['a blank description', (doc) => (doc.description = '  '), /"description"/],
    ['a scenario number of 0', (doc) => (doc.number = 0), /"number"/],
    ['a fractional scenario number', (doc) => (doc.number = 1.5), /"number"/],
    ['fewer than two players', (doc) => doc.players.pop(), /at least two players/],
    ['players that are not a list', (doc) => (doc.players = {}), /at least two players/],
    ['a duplicate player id', (doc) => (doc.players[1].id = 'red'), /Player id "red" is used more than once/],
    ['a player with no name', (doc) => delete doc.players[0].name, /Player 1 needs a "name"/],
    ['a player with no colour', (doc) => delete doc.players[1].colour, /Player 2 needs a "colour"/],
    ['a player with no fleet', (doc) => delete doc.players[0].fleet, /Player 1 needs a "fleet"/],
    ['a fleet that is not a word', (doc) => (doc.players[1].fleet = 'Green Fleet'), /Player 2 needs a "fleet"/],
    ['a player with no ships', (doc) => (doc.players[1].ships = []), /Player 2 needs at least one ship/],
    ['a ship with no id', (doc) => delete doc.players[0].ships[0].id, /Player 1 ship 1 needs an "id"/],
    ['a duplicate ship id', (doc) => (doc.players[1].ships[0].id = 'R1'), /Ship id "R1" is used more than once/],
    ['a ship with no name', (doc) => delete doc.players[0].ships[0].name, /Ship "R1" needs a "name"/],
    [
      'an unknown design',
      (doc) => (doc.players[0].ships[0].design = 'dreadnought'),
      /unknown design "dreadnought" for the red fleet/,
    ],
    [
      'a class only another fleet has',
      (doc) => (doc.players[1].fleet = 'green'),
      /Ship "B1" uses an unknown design "frigate" for the green fleet/,
    ],
    ['a ship with no design', (doc) => delete doc.players[0].ships[0].design, /Ship "R1" needs a "design"/],
    ['course 13', (doc) => (doc.players[0].ships[0].course = 13), /Ship "R1" needs a "course" from 1 to 12/],
    ['course 0', (doc) => (doc.players[0].ships[0].course = 0), /"course" from 1 to 12/],
    ['a fractional course', (doc) => (doc.players[0].ships[0].course = 2.5), /"course" from 1 to 12/],
    ['a negative velocity', (doc) => (doc.players[1].ships[0].velocity = -1), /Ship "B1" needs a whole-number "velocity"/],
    ['a fractional velocity', (doc) => (doc.players[1].ships[0].velocity = 1.5), /"velocity"/],
    ['a missing position', (doc) => delete doc.players[0].ships[0].x, /numeric "x" and "y"/],
    ['a position that is not a number', (doc) => (doc.players[1].ships[0].y = '3'), /Ship "B1" needs numeric "x" and "y"/],
  ];

  for (const [fault, breakIt, pattern] of rejections) {
    it(`rejects ${fault}`, () => {
      const raw = validScenario();
      breakIt(raw);
      expectProblem(
        problemsFrom(() => parseScenario(raw, frigates())),
        pattern,
      );
    });
  }

  it('lists every problem at once', () => {
    const raw = validScenario();
    raw.players[0].ships[0].course = 13;
    raw.players[1].ships[0].velocity = -2;
    const problems = problemsFrom(() => parseScenario(raw, frigates(), 'skirmish.json'));
    expect(problems).toHaveLength(2);
  });
});

describe('createShips', () => {
  it('creates one active ship per scenario entry with every drive working', () => {
    const designs = frigates();
    const scenario = parseScenario(validScenario(), designs);
    const ships = createShips(scenario, designs);
    expect(ships.map((ship) => ship.id)).toEqual(['R1', 'B1']);
    expect(ships[0]).toEqual({
      id: 'R1',
      designId: 'red/frigate',
      playerId: 'red',
      name: 'Ruby',
      position: { x: 5, y: 5 },
      course: 3,
      velocity: 4,
      drives: [
        { thrust: 3, functional: true },
        { thrust: 3, functional: true },
      ],
      hullDamage: 0,
      weaponsLost: [],
      fireControlsLost: [],
    });
    expect(ships[1]!.playerId).toBe('blue');
  });

  it('gives each ship its own drive and position objects', () => {
    const designs = frigates();
    const scenario = parseScenario(validScenario(), designs);
    const ships = createShips(scenario, designs);
    ships[0]!.drives[0]!.functional = false;
    ships[0]!.position.x = 99;
    expect(ships[1]!.drives[0]!.functional).toBe(true);
    expect(scenario.players[0]!.ships[0]!.x).toBe(5);
    expect(designs.get('red/frigate')!.drives[0]).toEqual({ thrust: 3 });
  });

  it('throws a ValidationError for a design that is not loaded', () => {
    const scenario = validScenario() as Scenario;
    expect(() => createShips(scenario, new Map())).toThrow(ValidationError);
  });
});

describe('shipped data files', () => {
  // Every design file is checked here, whether or not a scenario uses it yet.
  const FLEETS = ['red', 'green'];
  const CLASSES = ['frigate', 'destroyer', 'light-cruiser', 'heavy-cruiser', 'battlecruiser'];
  const keys = FLEETS.flatMap((fleet) => CLASSES.map((id) => designKey(fleet, id)));
  const all = keys.map((key) => parseDesign(readJson(`designs/${key}.json`), `${key}.json`));
  const designs = designMap(...all);

  it('has valid ship designs whose fleet and id match their paths', () => {
    expect(all.map((design) => designKey(design.fleet, design.id))).toEqual(keys);
    for (const design of all) {
      expect(design.drives.length).toBeGreaterThan(0);
      expect(design.weapons.length).toBeGreaterThan(0);
    }
  });

  it('has a valid scenario 2 with the expected forces on each side', () => {
    const scenario = parseScenario(readJson('scenarios/battlecruiser.json'), designs, 'battlecruiser.json');
    const ships = createShips(scenario, designs);

    const [player1, player2] = scenario.players;
    const p1Ships = ships.filter((ship) => ship.playerId === player1!.id);
    const p2Ships = ships.filter((ship) => ship.playerId === player2!.id);
    const classes = (list: typeof ships) => list.map((ship) => ship.designId).sort();

    // Player One: a heavy cruiser, a light cruiser and two destroyers, on the west side heading east.
    expect(classes(p1Ships)).toEqual(['green/destroyer', 'green/destroyer', 'green/heavy-cruiser', 'green/light-cruiser']);
    for (const ship of p1Ships) {
      expect(ship.position.x).toBeLessThan(0);
      expect(ship.course).toBe(3);
    }

    // Player Two ("they"): the battlecruiser with two frigates, on the east side heading west.
    expect(classes(p2Ships)).toEqual(['red/battlecruiser', 'red/frigate', 'red/frigate']);
    for (const ship of p2Ships) {
      expect(ship.position.x).toBeGreaterThan(0);
      expect(ship.course).toBe(9);
    }

    // The origin lies between the two fleets.
    const ys = ships.map((ship) => ship.position.y);
    expect(Math.min(...ys)).toBeLessThanOrEqual(0);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(0);
    for (const ship of ships) {
      expect(isCourse(ship.course)).toBe(true);
    }
  });
});

describe('ship designs from the record sheets', () => {
  // [class, class name, drive thrusts, hull rows, fire controls, weapons as class numbers (PT for pulse torpedo)]
  type Card = [string, string, number[], number[], number, (number | 'PT')[]];
  const sheets: Record<string, Card[]> = {
    // Red fleet: page 13 of the rules.
    red: [
      ['frigate', 'Frigate', [4, 4], [2, 2, 1, 1], 1, [2, 1, 1]],
      ['destroyer', 'Destroyer', [3, 3], [3, 2, 2, 2], 1, [2, 2, 1, 1]],
      ['light-cruiser', 'Light Cruiser', [3, 3], [3, 3, 3, 3], 2, [2, 2, 2, 1, 1]],
      ['heavy-cruiser', 'Heavy Cruiser', [3, 3], [5, 5, 4, 4], 2, ['PT', 3, 2, 2, 1, 1]],
      ['battlecruiser', 'Battlecruiser', [3, 3], [7, 7, 6, 6], 3, ['PT', 'PT', 3, 3, 2, 1, 1]],
    ],
    // Green fleet: page 14. Tougher and slower than the red.
    green: [
      ['frigate', 'Frigate', [3, 3], [2, 2, 2, 1], 1, [3, 1, 1]],
      ['destroyer', 'Destroyer', [2, 2], [3, 3, 3, 2], 1, [1, 2, 2]],
      ['light-cruiser', 'Light Cruiser', [2, 2], [4, 4, 4, 3], 2, [2, 2, 2, 1]],
      ['heavy-cruiser', 'Heavy Cruiser', [2, 2], [6, 6, 5, 5], 2, [2, 3, 3, 1, 1]],
      ['battlecruiser', 'Battlecruiser', [2, 2], [8, 8, 7, 7], 3, ['PT', 3, 3, 2, 1, 1]],
    ],
  };
  const load = (fleet: string, id: string) => parseDesign(readJson(`designs/${fleet}/${id}.json`), `${fleet}/${id}.json`);

  for (const [fleet, cards] of Object.entries(sheets)) {
    describe(`${fleet} fleet`, () => {
      for (const [id, className, drives, hullRows, fireControls, weapons] of cards) {
        describe(className, () => {
          const design = load(fleet, id);

          it('matches its card on the record sheet', () => {
            expect(design.id).toBe(id);
            expect(design.fleet).toBe(fleet);
            expect(design.className).toBe(className);
            expect(design.drives.map((drive) => drive.thrust)).toEqual(drives);
            expect(design.hullRows).toEqual(hullRows);
            expect(design.fireControls).toBe(fireControls);
            expect(design.weapons.map((weapon) => (weapon.type === 'pulseTorpedo' ? 'PT' : weapon.class))).toEqual(weapons);
          });

          it('has a map sprite that exists', () => {
            expect(() => readFileSync(new URL(`../../public/assets/${design.sprite}`, import.meta.url))).not.toThrow();
          });
        });
      }

      it('draws each class larger than the one before it', () => {
        const lengths = cards.map(([id]) => load(fleet, id).length);
        expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
        expect(new Set(lengths).size).toBe(lengths.length);
      });
    });
  }

  it('gives a class the same name and code in both fleets', () => {
    for (const [id] of sheets.red!) {
      const [red, green] = [load('red', id), load('green', id)];
      // Sprites and lengths differ: each fleet has photos of its own minis, sized to look right.
      expect([green.className, green.code]).toEqual([red.className, red.code]);
    }
  });
});

describe('parseScenarioIndex', () => {
  it('returns the listed scenario ids in order', () => {
    expect(parseScenarioIndex({ scenarios: ['b', 'a'] })).toEqual(['b', 'a']);
  });

  it.each([
    ['not an object', []],
    ['no scenarios list', {}],
    ['an empty list', { scenarios: [] }],
    ['a blank id', { scenarios: ['a', ' '] }],
  ])('rejects %s', (_fault, raw) => {
    expect(() => parseScenarioIndex(raw)).toThrow(ValidationError);
  });

  it('rejects a scenario listed twice', () => {
    expect(() => parseScenarioIndex({ scenarios: ['a', 'a'] })).toThrow(/listed more than once/);
  });
});

describe('buildCatalogue', () => {
  const designs = () => frigates();
  const scenarioDoc = (id: string, number: number, name: string): Doc => ({ ...validScenario(), id, number, name });

  it('lists the scenarios in number order, whatever order the index gives', () => {
    const catalogue = buildCatalogue(
      { scenarios: ['later', 'first'] },
      new Map([
        ['later', scenarioDoc('later', 2, 'The second')],
        ['first', scenarioDoc('first', 1, 'The first')],
      ]),
      designs(),
    );
    expect(catalogue.entries.map((entry) => [entry.number, entry.title])).toEqual([
      [1, 'The first'],
      [2, 'The second'],
    ]);
  });

  it('gives each entry its forces summary and the full scenario', () => {
    const catalogue = buildCatalogue({ scenarios: ['one'] }, new Map([['one', scenarioDoc('one', 1, 'One')]]), designs());
    const [entry] = catalogue.entries;
    expect(entry!.summary).toBe('FF vs FF');
    expect(entry!.description).toBe('A short skirmish.');
    expect(entry!.scenario.id).toBe('one');
    expect(catalogue.designs.get('red/frigate')).toBeDefined();
  });

  it('rejects two scenarios with the same number', () => {
    expect(() =>
      buildCatalogue(
        { scenarios: ['a', 'b'] },
        new Map([
          ['a', scenarioDoc('a', 1, 'A')],
          ['b', scenarioDoc('b', 1, 'B')],
        ]),
        designs(),
      ),
    ).toThrow(/More than one scenario is number 1/);
  });

  it('rejects an index naming a scenario that could not be found', () => {
    expect(() => buildCatalogue({ scenarios: ['missing'] }, new Map(), designs())).toThrow(/could not be found/);
  });

  it('rejects a scenario whose id does not match its file', () => {
    expect(() => buildCatalogue({ scenarios: ['file'] }, new Map([['file', scenarioDoc('other', 1, 'X')]]), designs())).toThrow(
      /listed as "file"/,
    );
  });

  it('rejects an invalid scenario document', () => {
    const broken = scenarioDoc('a', 1, 'A');
    broken.players[0].ships[0].course = 13;
    expect(() => buildCatalogue({ scenarios: ['a'] }, new Map([['a', broken]]), designs())).toThrow(ValidationError);
  });
});

describe('shipped scenarios', () => {
  const designIds = ['frigate', 'destroyer', 'light-cruiser', 'heavy-cruiser', 'battlecruiser'];
  const keys = ['red', 'green'].flatMap((fleet) => designIds.map((id) => designKey(fleet, id)));
  const designs = designMap(...keys.map((key) => parseDesign(readJson(`designs/${key}.json`), `${key}.json`)));
  const index = readJson('scenarios/index.json');
  const ids = parseScenarioIndex(index);
  const catalogue = buildCatalogue(index, new Map(ids.map((id) => [id, readJson(`scenarios/${id}.json`)])), designs);

  it('gives each design its naval shorthand code', () => {
    expect(designIds.map((id) => designs.get(designKey('red', id))!.code)).toEqual(['FF', 'DD', 'CL', 'CH', 'BC']);
  });

  it('lists the three scenarios, numbered, with their titles and forces', () => {
    expect(catalogue.entries.map(({ number, title, summary }) => ({ number, title, summary }))).toEqual([
      { number: 1, title: 'Introductory Scenario', summary: 'DD, 2 FF vs 2 CL' },
      { number: 2, title: 'They have a Battle Cruiser', summary: 'CH, CL, 2 DD vs BC, 2 FF' },
      { number: 3, title: 'Big Fleet Battle', summary: 'BC, CH, 2 CL, 2 DD, 2 FF vs BC, CH, 2 CL, 2 DD, 2 FF' },
    ]);
  });

  it('starts scenario 3 with every card from each record sheet, the red fleet a mirror image wheeled to course 11', () => {
    const scenario = catalogue.entries[2]!.scenario;
    const ships = createShips(scenario, designs);
    const [green, red] = scenario.players;
    const fleet = (player: typeof green) => ships.filter((ship) => ship.playerId === player!.id);
    const cards = [
      'battlecruiser',
      'destroyer',
      'destroyer',
      'frigate',
      'frigate',
      'heavy-cruiser',
      'light-cruiser',
      'light-cruiser',
    ];
    expect(
      fleet(green)
        .map((ship) => ship.designId)
        .sort(),
    ).toEqual(cards.map((id) => designKey('green', id)));
    expect(
      fleet(red)
        .map((ship) => ship.designId)
        .sort(),
    ).toEqual(cards.map((id) => designKey('red', id)));

    // Green: the battlecruiser holds the centre between the light cruisers; the heavy cruiser leads it,
    // flanked by the destroyers and then the frigates. All head east.
    const at = (id: string) => ships.find((ship) => ship.id === id)!.position;
    expect([at('CL1'), at('BC1'), at('CL2')]).toEqual([
      { x: -30, y: -10 },
      { x: -30, y: 0 },
      { x: -30, y: 10 },
    ]);
    expect(['FF1', 'DD1', 'CH1', 'DD2', 'FF2'].map(at)).toEqual([-20, -10, 0, 10, 20].map((y) => ({ x: -20, y })));
    expect(new Set(fleet(green).map((ship) => ship.course))).toEqual(new Set([3]));

    // Red: the same formation mirrored to face west, then wheeled 60 degrees clockwise about its
    // battlecruiser to head for course 11, and moved 24 mu south.
    expect(at('BC2')).toEqual({ x: 30, y: 24 });
    expect(new Set(fleet(red).map((ship) => ship.course))).toEqual(new Set([11]));
    const turn = Math.PI / 3;
    const redShips = fleet(red);
    fleet(green).forEach((ship, index) => {
      const opposite = redShips[index]!;
      expect(opposite.designId.replace('red/', '')).toBe(ship.designId.replace('green/', ''));
      // The green ship's place relative to its battlecruiser, mirrored east-west.
      const dx = -(ship.position.x - at('BC1').x);
      const dy = ship.position.y - at('BC1').y;
      expect(opposite.position.x).toBeCloseTo(30 + dx * Math.cos(turn) - dy * Math.sin(turn), 1);
      expect(opposite.position.y).toBeCloseTo(24 + dx * Math.sin(turn) + dy * Math.cos(turn), 1);
    });
  });

  it('gives every scenario a short description paragraph', () => {
    for (const entry of catalogue.entries) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.description).not.toContain('\n');
    }
  });

  it('makes Player One the green fleet and Player Two the red in every scenario', () => {
    for (const entry of catalogue.entries) {
      expect(entry.scenario.players.map((player) => [player.name, player.colour, player.fleet])).toEqual([
        ['Player One', '#4cc27a', 'green'],
        ['Player Two', '#e8322b', 'red'],
      ]);
    }
  });

  it('starts scenario 1 with two frigates and a destroyer west heading east and two light cruisers east heading west', () => {
    const scenario = catalogue.entries[0]!.scenario;
    const ships = createShips(scenario, designs);
    const [player1, player2] = scenario.players;
    const p1 = ships.filter((ship) => ship.playerId === player1!.id);
    const p2 = ships.filter((ship) => ship.playerId === player2!.id);
    expect(p1.map((ship) => ship.designId)).toEqual(['green/frigate', 'green/destroyer', 'green/frigate']);
    expect(p2.map((ship) => ship.designId)).toEqual(['red/light-cruiser', 'red/light-cruiser']);
    for (const ship of p1) {
      expect(ship.position.x).toBeLessThan(0);
      expect(ship.course).toBe(3);
    }
    for (const ship of p2) {
      expect(ship.position.x).toBeGreaterThan(0);
      expect(ship.course).toBe(9);
    }
  });

  it('starts scenario 1 with only the green frigates in range, and both sides able to fire on turn 1 at the starting speeds', () => {
    const scenario = catalogue.entries[0]!.scenario;
    const [player1, player2] = scenario.players;
    const game = createGame(scenario, designs);
    // At about 32 mu apart only the green frigates' class 3 beams reach, with one die each.
    expect(game.ships.filter((ship) => canFire(game, ship.id)).map((ship) => ship.id)).toEqual(['FF1', 'FF3']);

    const moved = resolveMovement(lockInOrders(lockInOrders(game, player1!.id), player2!.id)).next;
    // Alternate the dice so the initiative roll can't tie forever.
    let roll = 0;
    const turn1 = startFirePhase(moved, () => [0.2, 0.8][roll++ % 2]!);
    expect(turn1.phase.kind).toBe('firing');
    for (const player of [player1!, player2!]) {
      expect(turn1.ships.some((ship) => ship.playerId === player.id && canFire(turn1, ship.id))).toBe(true);
    }
  });
});

describe('loadCatalogue', () => {
  /** Serves files from public/data as fetch would, with some documents swapped for others. */
  const serve = (swaps: Record<string, unknown> = {}) =>
    vi.stubGlobal('fetch', async (url: string) => {
      const path = url.replace(/^\/data\//, '');
      const body = path in swaps ? swaps[path] : readJson(path);
      return { ok: true, status: 200, statusText: 'OK', json: async () => body };
    });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads each player's designs from their fleet's folder", async () => {
    serve();
    const catalogue = await loadCatalogue('/data');
    expect([...catalogue.designs.keys()].sort()).toEqual([
      'green/battlecruiser',
      'green/destroyer',
      'green/frigate',
      'green/heavy-cruiser',
      'green/light-cruiser',
      'red/battlecruiser',
      'red/destroyer',
      'red/frigate',
      'red/heavy-cruiser',
      'red/light-cruiser',
    ]);
    expect(catalogue.designs.get('green/frigate')!.fleet).toBe('green');
  });

  it('rejects a design file whose fleet does not match its folder', async () => {
    serve({ 'designs/green/frigate.json': readJson('designs/red/frigate.json') });
    await expect(loadCatalogue('/data')).rejects.toThrow(/"red" and "frigate", but the file is designs\/green\/frigate\.json/);
  });
});
