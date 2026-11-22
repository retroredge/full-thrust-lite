import { describe, expect, it } from 'vitest';
import { arcBoundaries, buildFireEnvelope, envelopeRadius, sectorOutline } from '../../src/view/fireEnvelope';
import { beam, design } from '../support/fireFixtures';

/** The heavy cruiser's beams: C3 FP/F/FS, C2 FP/F/AP, C2 F/FS/AS, two all-round C1s, and a torpedo. */
const HEAVY_CRUISER = design(
  'heavy-cruiser',
  [
    { type: 'pulseTorpedo', arcs: ['F'] },
    beam(3, ['FP', 'F', 'FS']),
    beam(2, ['FP', 'F', 'AP']),
    beam(2, ['F', 'FS', 'AS']),
    beam(1, ['FP', 'F', 'FS', 'AS', 'AP']),
    beam(1, ['FP', 'F', 'FS', 'AS', 'AP', 'A']),
  ],
  2,
);
const ship = { position: { x: 5, y: -3 }, course: 3 };

describe('buildFireEnvelope', () => {
  it('covers each 12 mu band with the arcs of the beams that reach it', () => {
    const envelope = buildFireEnvelope(ship, HEAVY_CRUISER, [], '#f00')!;
    expect(envelope.centre).toEqual({ x: 5, y: -3 });
    expect(envelope.heading).toBe(90);
    expect(envelope.bands).toEqual([
      { inner: 0, outer: 12, arcs: ['F', 'FS', 'AS', 'AP', 'FP'] },
      { inner: 12, outer: 24, arcs: ['F', 'FS', 'AS', 'AP', 'FP'] },
      { inner: 24, outer: 36, arcs: ['F', 'FS', 'FP'] },
    ]);
    expect(envelope.torpedo).toEqual({ range: 30, arcs: ['F'] });
    expect(envelopeRadius(envelope)).toBe(36);
  });

  it('leaves out beams that have already fired', () => {
    const envelope = buildFireEnvelope(ship, HEAVY_CRUISER, [1, 3], '#f00')!;
    expect(envelope.bands).toEqual([
      { inner: 0, outer: 12, arcs: ['F', 'FS', 'AS', 'AP', 'FP'] },
      { inner: 12, outer: 24, arcs: ['F', 'AP', 'FP'] },
    ]);
  });

  it('shows only the torpedo reach once the beams have fired, out to 30 mu', () => {
    const envelope = buildFireEnvelope(ship, HEAVY_CRUISER, [1, 2, 3, 4, 5], '#f00')!;
    expect(envelope.bands).toEqual([]);
    expect(envelope.torpedo).toEqual({ range: 30, arcs: ['F'] });
    expect(envelopeRadius(envelope)).toBe(30);
  });

  it('leaves out a fired torpedo, and is null when nothing is left to fire', () => {
    expect(buildFireEnvelope(ship, HEAVY_CRUISER, [0], '#f00')!.torpedo).toBeNull();
    expect(buildFireEnvelope(ship, HEAVY_CRUISER, [0, 1, 2, 3, 4, 5], '#f00')).toBeNull();
  });
});

describe('buildFireEnvelope heading override', () => {
  it('uses the given heading for a ship part-way through a turn', () => {
    expect(buildFireEnvelope(ship, HEAVY_CRUISER, [], '#f00', 75)!.heading).toBe(75);
  });
});

describe('arcBoundaries', () => {
  it('runs a line out to full reach between each pair of neighbouring arcs', () => {
    const envelope = buildFireEnvelope({ position: { x: 0, y: 0 }, course: 0 }, HEAVY_CRUISER, [], '#f00')!;
    const lines = arcBoundaries(envelope);
    expect(lines).toHaveLength(6);
    for (const [from] of lines) {
      expect(from).toEqual({ x: 0, y: 0 });
    }
    // Heading north: the first boundary (F/FP) is 30 degrees to port of the bow, 36 mu out.
    const [, end] = lines[0]!;
    expect(end.x).toBeCloseTo(-18);
    expect(end.y).toBeCloseTo(-31.18, 2);
    expect(lines.map(([, to]) => Math.round(Math.hypot(to.x, to.y)))).toEqual([36, 36, 36, 36, 36, 36]);
  });
});

describe('sectorOutline', () => {
  it('spans the arc relative to the heading, from the outer edge round to the inner', () => {
    // Ship heading east: its fore arc runs from 60 to 120 degrees on the map.
    const outline = sectorOutline({ centre: { x: 0, y: 0 }, heading: 90 }, 'F', 12, 24, 30);
    const round = outline.map((point) => ({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 }));
    expect(round[0]).toEqual({ x: 20.78, y: -12 });
    expect(round[2]).toEqual({ x: 20.78, y: 12 });
    expect(round[3]).toEqual({ x: 10.39, y: 6 });
    expect(round).toHaveLength(6);
  });

  it('is a pie slice from the centre when the inner radius is 0', () => {
    const outline = sectorOutline({ centre: { x: 1, y: 1 }, heading: 0 }, 'F', 0, 12, 60);
    expect(outline[0]).toEqual({ x: 1, y: 1 });
    expect(outline).toHaveLength(3);
  });
});
