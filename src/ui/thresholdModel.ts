import type { ThresholdCheck } from '../game/fire';
import type { ShipSystem } from '../rules/threshold';

/** The rolls for one kind of system in a threshold check: every weapon, every fire control or every drive. */
export interface ThresholdGroup {
  kind: ShipSystem['kind'];
  rolls: ThresholdCheck['rolls'];
}

/**
 * Splits a threshold check's rolls into groups of the same kind of system, in
 * the order they were rolled (weapons, then fire controls, then drives), so
 * each group's dice can be rolled together. Kinds with no working systems
 * are left out.
 */
export function thresholdGroups(rolls: ThresholdCheck['rolls']): ThresholdGroup[] {
  const groups: ThresholdGroup[] = [];
  for (const roll of rolls) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.kind === roll.system.kind) {
      last.rolls.push(roll);
    } else {
      groups.push({ kind: roll.system.kind, rolls: [roll] });
    }
  }
  return groups;
}
