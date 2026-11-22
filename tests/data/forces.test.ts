import { describe, expect, it } from 'vitest';
import { forceSummary } from '../../src/data/forces';
import { designKey, type Scenario, type ScenarioShip } from '../../src/data/loader';
import type { ShipDesign } from '../../src/rules/ship';

const design = (id: string, code: string, length: number) => ({ id, code, length }) as ShipDesign;
const DESIGNS = new Map(
  [
    design('frigate', 'FF', 2.5),
    design('destroyer', 'DD', 3),
    design('light-cruiser', 'CL', 3.75),
    design('heavy-cruiser', 'CH', 4.5),
    design('battlecruiser', 'BC', 5.5),
  ].map((item) => [designKey('red', item.id), item]),
);

let shipCount = 0;
const ships = (...designs: string[]): ScenarioShip[] =>
  designs.map((id) => {
    shipCount += 1;
    return { id: `S${shipCount}`, design: id, name: 'name', x: 0, y: 0, course: 3, velocity: 6 };
  });

const scenario = (...sides: ScenarioShip[][]): Scenario => ({
  id: 'test',
  number: 1,
  name: 'Test',
  description: 'A test.',
  players: sides.map((list, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    colour: '#fff',
    fleet: 'red',
    ships: list,
  })),
});

describe('forceSummary', () => {
  it('summarises the introductory scenario', () => {
    expect(forceSummary(scenario(ships('frigate', 'frigate', 'frigate'), ships('light-cruiser', 'light-cruiser')), DESIGNS)).toBe(
      '3 FF vs 2 CL',
    );
  });

  it('lists the largest class first, whatever order the ships are in', () => {
    const p1 = ships('frigate', 'battlecruiser', 'frigate');
    const p2 = ships('destroyer', 'light-cruiser', 'heavy-cruiser', 'destroyer');
    expect(forceSummary(scenario(p1, p2), DESIGNS)).toBe('BC, 2 FF vs CH, CL, 2 DD');
  });

  it('gives no count for a single ship of a class', () => {
    expect(forceSummary(scenario(ships('destroyer'), ships('heavy-cruiser')), DESIGNS)).toBe('DD vs CH');
  });

  it('handles more than two players', () => {
    expect(forceSummary(scenario(ships('frigate'), ships('destroyer'), ships('frigate', 'frigate')), DESIGNS)).toBe(
      'FF vs DD vs 2 FF',
    );
  });
});
