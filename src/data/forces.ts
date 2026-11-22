import type { ShipDesign } from '../rules/ship';
import { designKey, type Scenario } from './loader';

/**
 * Summarises the forces in a scenario in naval shorthand, e.g.
 * "BC, 2 FF vs CH, CL, 2 DD". Each side lists its classes largest first,
 * with a count when there is more than one ship of a class.
 */
export function forceSummary(scenario: Scenario, designs: ReadonlyMap<string, ShipDesign>): string {
  return scenario.players
    .map((player) => {
      const counts = new Map<string, { design: ShipDesign | undefined; count: number }>();
      for (const ship of player.ships) {
        const key = designKey(player.fleet, ship.design);
        const entry = counts.get(key) ?? { design: designs.get(key), count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
      return [...counts.entries()]
        .sort(([, a], [, b]) => (b.design?.length ?? 0) - (a.design?.length ?? 0))
        .map(([key, { design, count }]) => {
          const code = design?.code ?? key;
          return count > 1 ? `${count} ${code}` : code;
        })
        .join(', ');
    })
    .join(' vs ');
}
