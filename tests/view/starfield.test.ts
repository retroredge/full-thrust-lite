import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from '../../src/view/camera';
import {
  GALAXY_TILE,
  MAX_NEBULA_TILES_ACROSS,
  MAX_TILES_ACROSS,
  NEBULA_TILE,
  STAR_COLOURS,
  STAR_TILE,
  brightnessCutoff,
  galaxiesInTile,
  nebulaInTile,
  nebulaLevel,
  nebulaTileSize,
  seededRandom,
  starLevel,
  starTileSize,
  starsInTile,
  tileRange,
} from '../../src/view/starfield';

const SEED = 1234;
const tiles: [number, number][] = [];
for (let x = -6; x <= 6; x += 1) {
  for (let y = -6; y <= 6; y += 1) {
    tiles.push([x, y]);
  }
}

describe('seededRandom', () => {
  it('stays in [0, 1)', () => {
    for (const seed of [0, 1, 42, 0xffffffff, -7]) {
      const random = seededRandom(seed);
      for (let index = 0; index < 2000; index += 1) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('repeats the same sequence for the same seed and differs for another seed', () => {
    const sample = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 20 }, () => random());
    };
    expect(sample(99)).toEqual(sample(99));
    expect(sample(99)).not.toEqual(sample(100));
  });
});

describe('starsInTile', () => {
  it('gives identical stars for the same tile and seed', () => {
    expect(starsInTile(3, -2, SEED)).toEqual(starsInTile(3, -2, SEED));
  });

  it('gives different stars for different tiles and seeds', () => {
    const local = (tileX: number, tileY: number, seed = SEED) =>
      starsInTile(tileX, tileY, seed).map((star) => [star.x - tileX * STAR_TILE, star.y - tileY * STAR_TILE, star.brightness]);
    const reference = local(0, 0);
    expect(local(1, 0)).not.toEqual(reference);
    expect(local(0, 1)).not.toEqual(reference);
    expect(local(-1, -1)).not.toEqual(reference);
    expect(local(0, 0, SEED + 1)).not.toEqual(reference);
  });

  it('places every star inside its tile with brightness and size in range', () => {
    for (const [tileX, tileY] of tiles) {
      const stars = starsInTile(tileX, tileY, SEED);
      expect(stars.length).toBeGreaterThan(0);
      for (const star of stars) {
        expect(star.x).toBeGreaterThanOrEqual(tileX * STAR_TILE);
        expect(star.x).toBeLessThan((tileX + 1) * STAR_TILE);
        expect(star.y).toBeGreaterThanOrEqual(tileY * STAR_TILE);
        expect(star.y).toBeLessThan((tileY + 1) * STAR_TILE);
        expect(star.brightness).toBeGreaterThanOrEqual(0);
        expect(star.brightness).toBeLessThanOrEqual(1);
        expect(star.radius).toBeGreaterThan(0);
        expect(star.colour).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('galaxiesInTile', () => {
  it('gives identical galaxies for the same tile and seed', () => {
    for (const [tileX, tileY] of tiles) {
      expect(galaxiesInTile(tileX, tileY, SEED)).toEqual(galaxiesInTile(tileX, tileY, SEED));
    }
  });

  it('puts galaxies in some tiles but not all', () => {
    const counts = tiles.map(([tileX, tileY]) => galaxiesInTile(tileX, tileY, SEED).length);
    expect(counts.some((count) => count > 0)).toBe(true);
    expect(counts.some((count) => count === 0)).toBe(true);
    expect(counts.every((count) => count <= 1)).toBe(true);
  });

  it('differs between tiles', () => {
    const local = tiles.flatMap(([tileX, tileY]) =>
      galaxiesInTile(tileX, tileY, SEED).map((galaxy) => `${galaxy.x - tileX * GALAXY_TILE},${galaxy.radius}`),
    );
    expect(new Set(local).size).toBe(local.length);
  });

  it('centres each galaxy inside its tile with sensible shape values', () => {
    for (const [tileX, tileY] of tiles) {
      for (const galaxy of galaxiesInTile(tileX, tileY, SEED)) {
        expect(galaxy.x).toBeGreaterThanOrEqual(tileX * GALAXY_TILE);
        expect(galaxy.x).toBeLessThan((tileX + 1) * GALAXY_TILE);
        expect(galaxy.y).toBeGreaterThanOrEqual(tileY * GALAXY_TILE);
        expect(galaxy.y).toBeLessThan((tileY + 1) * GALAXY_TILE);
        expect(galaxy.radius).toBeGreaterThan(0);
        expect(galaxy.flatten).toBeGreaterThan(0);
        expect(galaxy.flatten).toBeLessThanOrEqual(1);
        expect(galaxy.opacity).toBeGreaterThan(0);
        expect(galaxy.opacity).toBeLessThanOrEqual(1);
        for (const component of galaxy.tint) {
          expect(component).toBeGreaterThanOrEqual(0);
          expect(component).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

describe('tileRange', () => {
  it('covers a span with inclusive tile indices', () => {
    expect(tileRange(0, 24, 12)).toEqual([0, 2]);
    expect(tileRange(5, 11.9, 12)).toEqual([0, 0]);
  });

  it('rounds down for negative coordinates', () => {
    expect(tileRange(-1, 1, 12)).toEqual([-1, 0]);
    expect(tileRange(-12, -0.5, 12)).toEqual([-1, -1]);
    expect(tileRange(-12.5, -12, 12)).toEqual([-2, -1]);
    expect(tileRange(-130, -61, 60)).toEqual([-3, -2]);
  });
});

describe('brightnessCutoff', () => {
  it('shows every star when zoomed in', () => {
    expect(brightnessCutoff(12)).toBe(0);
    expect(brightnessCutoff(40)).toBe(0);
    expect(brightnessCutoff(80)).toBe(0);
  });

  it('never increases as the zoom rises and stays within 0..1', () => {
    let previous = Infinity;
    for (let zoom = 0.5; zoom <= 100; zoom += 0.25) {
      const cutoff = brightnessCutoff(zoom);
      expect(cutoff).toBeGreaterThanOrEqual(0);
      expect(cutoff).toBeLessThan(1);
      expect(cutoff).toBeLessThanOrEqual(previous);
      previous = cutoff;
    }
  });

  it('hides some faint stars when zoomed out', () => {
    expect(brightnessCutoff(2)).toBeGreaterThan(0);
  });
});

describe('star levels of detail', () => {
  it('uses level 0 while few tiles are in view', () => {
    expect(starLevel(0)).toBe(0);
    expect(starLevel(STAR_TILE * MAX_TILES_ACROSS)).toBe(0);
  });

  it('goes up a level each time the view doubles in width', () => {
    const width = STAR_TILE * MAX_TILES_ACROSS;
    expect(starLevel(width * 1.01)).toBe(1);
    expect(starLevel(width * 2)).toBe(1);
    expect(starLevel(width * 2.01)).toBe(2);
    expect(starLevel(width * 8)).toBe(3);
  });

  it('doubles the tile size at each level', () => {
    expect(starTileSize(0)).toBe(STAR_TILE);
    expect(starTileSize(1)).toBe(STAR_TILE * 2);
    expect(starTileSize(3)).toBe(STAR_TILE * 8);
  });

  it('keeps the number of tiles in view bounded across the whole zoom range', () => {
    const viewport = { width: 1000, height: 560 };
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom *= 1.1) {
      const width = viewport.width / zoom;
      const height = viewport.height / zoom;
      // Worst case: the view straddles tile edges, adding one tile each way.
      for (const offset of [0, 0.37, -123.4, 5000.5]) {
        const size = starTileSize(starLevel(width));
        const [minX, maxX] = tileRange(offset, offset + width, size);
        const [minY, maxY] = tileRange(offset, offset + height, size);
        const across = maxX - minX + 1;
        const tiles = across * (maxY - minY + 1);
        expect(across).toBeLessThanOrEqual(MAX_TILES_ACROSS + 1);
        expect(tiles).toBeLessThanOrEqual((MAX_TILES_ACROSS + 1) * (MAX_TILES_ACROSS + 1));
      }
    }
  });

  it("places a level's stars inside that level's larger tiles", () => {
    const level = 3;
    const size = starTileSize(level);
    for (const star of starsInTile(-2, 5, 42, level)) {
      expect(star.x).toBeGreaterThanOrEqual(-2 * size);
      expect(star.x).toBeLessThan(-1 * size);
      expect(star.y).toBeGreaterThanOrEqual(5 * size);
      expect(star.y).toBeLessThan(6 * size);
    }
  });

  it('gives each level its own stars, and level 0 the same stars as before', () => {
    expect(starsInTile(1, 1, 42, 0)).toEqual(starsInTile(1, 1, 42));
    const scaled = starsInTile(1, 1, 42, 1).map((star) => ({ x: star.x / 2, y: star.y / 2 }));
    const base = starsInTile(1, 1, 42, 0).map((star) => ({ x: star.x, y: star.y }));
    expect(scaled).not.toEqual(base);
  });
});

/** "#rrggbb" as [red, green, blue]. */
const rgb = (colour: string): number[] => [1, 3, 5].map((start) => parseInt(colour.slice(start, start + 2), 16));

describe('star colours', () => {
  it('range from white through blue to red, mostly white', () => {
    const colours = tiles.flatMap(([x, y]) => starsInTile(x, y, SEED)).map((star) => star.colour);
    const white = colours.filter((colour) => colour === '#ffffff').length;
    expect(white / colours.length).toBeGreaterThan(0.15);
    expect(white / colours.length).toBeLessThan(0.5);
    const bluish = STAR_COLOURS.filter((colour) => {
      const [r, , b] = rgb(colour);
      return b - r >= 80;
    });
    const reddish = STAR_COLOURS.filter((colour) => {
      const [r, , b] = rgb(colour);
      return r - b >= 120;
    });
    expect(colours.some((colour) => bluish.includes(colour))).toBe(true);
    expect(colours.some((colour) => reddish.includes(colour))).toBe(true);
  });
});

describe('nebulaInTile', () => {
  it('gives identical clouds for the same tile and seed', () => {
    expect(nebulaInTile(3, -2, SEED)).toEqual(nebulaInTile(3, -2, SEED));
  });

  it('puts nebulae in some tiles but leaves others clear', () => {
    const counts = tiles.map(([x, y]) => nebulaInTile(x, y, SEED).length);
    expect(counts.some((count) => count === 0)).toBe(true);
    expect(counts.some((count) => count > 0)).toBe(true);
  });

  it('makes every cloud a faint blue, sized to its level', () => {
    for (const level of [0, 3]) {
      const size = nebulaTileSize(level);
      for (const [x, y] of tiles) {
        for (const blob of nebulaInTile(x, y, SEED, level)) {
          const [red, green, blue] = blob.tint;
          expect(blue).toBeGreaterThan(red);
          expect(blue).toBeGreaterThan(green);
          expect(blob.opacity).toBeGreaterThan(0);
          expect(blob.opacity).toBeLessThanOrEqual(0.11);
          expect(blob.radius).toBeGreaterThan(size * 0.2);
          expect(blob.radius).toBeLessThan(size * 0.6);
          expect(blob.x).toBeGreaterThan((x - 0.2) * size);
          expect(blob.x).toBeLessThan((x + 1.2) * size);
        }
      }
    }
  });

  it('keeps the number of nebula tiles in view bounded across the whole zoom range', () => {
    expect(nebulaTileSize(0)).toBe(NEBULA_TILE);
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom *= 1.1) {
      const width = 1000 / zoom;
      const size = nebulaTileSize(nebulaLevel(width));
      // The renderer adds a tile beyond each edge, and the view may straddle tile edges.
      const [minX, maxX] = tileRange(0.37 - size, 0.37 + width + size, size);
      expect(maxX - minX + 1).toBeLessThanOrEqual(MAX_NEBULA_TILES_ACROSS + 3);
    }
  });
});
