import { courseToDegrees, type Vec2 } from '../rules/course';
import { ARC_CENTRES, RANGE_BAND, TORPEDO_RANGE, firingArcs } from '../rules/fire';
import { ARCS, type Arc, type Ship, type ShipDesign } from '../rules/ship';

/** One range band of a ship's fire envelope and the arcs its beams cover there. */
export interface EnvelopeBand {
  /** Inner and outer radius in mu. */
  inner: number;
  outer: number;
  /** Arcs in which at least one unfired beam reaches this band, in clockwise order from the bow. */
  arcs: Arc[];
}

/**
 * Where a ship's weapons can reach, for drawing on the map: concentric 12 mu
 * beam range bands, each with the fire arcs covered at that range, and the
 * torpedoes' 30 mu reach. Positions are on the game plane, so any projection
 * can draw it.
 */
export interface FireEnvelope {
  centre: Vec2;
  /** Ship heading in degrees clockwise from north. */
  heading: number;
  colour: string;
  bands: EnvelopeBand[];
  /** How far the unfired pulse torpedoes reach, and through which arcs, or null if there are none. */
  torpedo: { range: number; arcs: Arc[] } | null;
}

/**
 * The envelope of a ship's beams and pulse torpedoes that have not fired yet,
 * or null if it has none. A beam of class k reaches out to band k, so band k
 * is covered by the beams of class k and above. Torpedoes reach 30 mu through
 * their own arcs. `heading` (degrees clockwise from north)
 * overrides the ship's course, for a ship caught part-way through a turn.
 */
export function buildFireEnvelope(
  ship: Pick<Ship, 'position' | 'course'>,
  design: Pick<ShipDesign, 'weapons'>,
  weaponsFired: readonly number[],
  colour: string,
  heading = courseToDegrees(ship.course),
): FireEnvelope | null {
  const beams = design.weapons.filter(
    (weapon, index) => weapon.type === 'beam' && !weaponsFired.includes(index) && (weapon.class ?? 0) > 0,
  );
  const torpedoArcs = new Set(
    design.weapons.flatMap((weapon, index) =>
      weapon.type === 'pulseTorpedo' && !weaponsFired.includes(index) ? firingArcs(weapon) : [],
    ),
  );
  const torpedo = torpedoArcs.size === 0 ? null : { range: TORPEDO_RANGE, arcs: ARCS.filter((arc) => torpedoArcs.has(arc)) };
  const maxClass = Math.max(0, ...beams.map((weapon) => weapon.class ?? 0));
  if (maxClass === 0 && torpedo === null) {
    return null;
  }
  const bands: EnvelopeBand[] = [];
  for (let band = 1; band <= maxClass; band += 1) {
    const covered = new Set(beams.filter((weapon) => (weapon.class ?? 0) >= band).flatMap(firingArcs));
    bands.push({ inner: (band - 1) * RANGE_BAND, outer: band * RANGE_BAND, arcs: ARCS.filter((arc) => covered.has(arc)) });
  }
  return { centre: { ...ship.position }, heading, colour, bands, torpedo };
}

/** Largest range in an envelope, beams or torpedoes, in mu. */
export function envelopeRadius(envelope: FireEnvelope): number {
  return Math.max(envelope.bands.at(-1)?.outer ?? 0, envelope.torpedo?.range ?? 0);
}

function pointAt(centre: Vec2, degrees: number, radius: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  return { x: centre.x + Math.sin(radians) * radius, y: centre.y - Math.cos(radians) * radius };
}

/**
 * The six lines between neighbouring fire arcs, from the ship out to the
 * edge of its reach, as [from, to] pairs on the game plane.
 */
export function arcBoundaries(envelope: FireEnvelope): [Vec2, Vec2][] {
  const radius = envelopeRadius(envelope);
  return ARCS.map((arc) => [envelope.centre, pointAt(envelope.centre, envelope.heading + ARC_CENTRES[arc] - 30, radius)]);
}

/**
 * The outline of one arc of one band on the game plane: the outer edge
 * clockwise, then the inner edge back, sampled every `step` degrees. An inner
 * radius of 0 gives a pie slice.
 */
export function sectorOutline(
  envelope: Pick<FireEnvelope, 'centre' | 'heading'>,
  arc: Arc,
  inner: number,
  outer: number,
  step = 3,
): Vec2[] {
  const from = envelope.heading + ARC_CENTRES[arc] - 30;
  const count = Math.ceil(60 / step);
  const outerEdge: Vec2[] = [];
  const innerEdge: Vec2[] = [];
  for (let index = 0; index <= count; index += 1) {
    const degrees = from + (60 * index) / count;
    outerEdge.push(pointAt(envelope.centre, degrees, outer));
    if (inner > 0) {
      innerEdge.push(pointAt(envelope.centre, degrees, inner));
    }
  }
  return inner > 0 ? [...outerEdge, ...innerEdge.reverse()] : [envelope.centre, ...outerEdge];
}
