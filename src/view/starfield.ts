/**
 * A procedural backdrop of stars and a few faint galaxies.
 *
 * Space is divided into square tiles on the game plane. Each tile's contents
 * come from a random number generator seeded by the tile's coordinates, so the
 * backdrop is endless, never changes between frames or reloads, and only the
 * tiles in view need generating.
 *
 * Stars use levels of detail so the number of tiles in view stays small
 * however far out the view is zoomed. Each level doubles the tile size, so a
 * level's stars are spread four times as thinly over the plane and look
 * about as dense on screen as level 0 does close up.
 */

export interface Star {
  x: number;
  y: number;
  /** 0 (faintest) to 1 (brightest). Faint stars are hidden when zoomed out. */
  brightness: number;
  /** Radius in pixels at normal zoom. */
  radius: number;
  colour: string;
}

export interface Galaxy {
  x: number;
  y: number;
  /** Radius of the long axis, in mu. */
  radius: number;
  /** Short axis as a fraction of the long axis. */
  flatten: number;
  /** Rotation in radians. */
  angle: number;
  /** Red, green, blue components, 0 to 255. */
  tint: [number, number, number];
  opacity: number;
}

export const STAR_TILE = 12;
export const GALAXY_TILE = 60;
/** Most star tiles across the visible width before switching to the next level of detail. */
export const MAX_TILES_ACROSS = 24;
/** Galaxies are not drawn when zoomed out further than this many pixels per mu. */
export const MIN_GALAXY_ZOOM = 1.5;
const STARS_PER_TILE = 26;
const GALAXY_CHANCE = 0.55;

/**
 * Star colours from white through blue to red, weighted towards white like a
 * real sky: hot blue-white stars, then cooler yellow, orange and red ones.
 */
export const STAR_COLOURS = [
  '#ffffff',
  '#ffffff',
  '#ffffff',
  '#eef3ff',
  '#dbe6ff',
  '#c4d5ff',
  '#a9c1ff',
  '#8fadff',
  '#fff4e0',
  '#ffdcb4',
  '#ffbe8f',
  '#ff9a78',
  '#ff7a66',
];
const GALAXY_TINTS: [number, number, number][] = [
  [150, 170, 255],
  [200, 160, 255],
  [255, 190, 160],
  [140, 210, 230],
];

/** Side of a nebula tile at level 0, in mu. */
export const NEBULA_TILE = 100;
/** Most nebula tiles across the visible width before switching to the next level of detail. */
export const MAX_NEBULA_TILES_ACROSS = 6;
const NEBULA_CHANCE = 0.6;
/** Blues for the nebula clouds, from deep blue to a faint teal. */
const NEBULA_TINTS: [number, number, number][] = [
  [40, 80, 200],
  [55, 100, 230],
  [30, 70, 170],
  [60, 120, 210],
  [80, 90, 220],
];

/** A soft cloud in a nebula: a faint blue glow fading to nothing at its edge. */
export interface NebulaBlob {
  x: number;
  y: number;
  /** In mu. */
  radius: number;
  /** Red, green, blue components, 0 to 255. */
  tint: [number, number, number];
  /** Opacity at the centre. */
  opacity: number;
}

/** Small, fast seeded random number generator (mulberry32). Returns values in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileSeed(tileX: number, tileY: number, salt: number): number {
  let hash = salt >>> 0;
  hash = Math.imul(hash ^ (tileX | 0), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13) ^ (tileY | 0), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** Side of a star tile at a level of detail, in mu. */
export function starTileSize(level: number): number {
  return STAR_TILE * 2 ** level;
}

/** The coarsest level needed to keep at most `MAX_TILES_ACROSS` tiles across `visibleWidth` mu. */
export function starLevel(visibleWidth: number): number {
  const tiles = visibleWidth / STAR_TILE;
  if (!(tiles > MAX_TILES_ACROSS)) {
    return 0;
  }
  return Math.ceil(Math.log2(tiles / MAX_TILES_ACROSS));
}

export function starsInTile(tileX: number, tileY: number, seed: number, level = 0): Star[] {
  const size = starTileSize(level);
  // Each level gets its own seeds so its stars don't line up with another level's.
  const random = seededRandom(tileSeed(tileX, tileY, (seed + Math.imul(level, 0x27d4eb2f)) >>> 0));
  const stars: Star[] = [];
  for (let index = 0; index < STARS_PER_TILE; index += 1) {
    // Squaring skews the mix towards faint stars.
    const brightness = Math.pow(random(), 2.2);
    stars.push({
      x: (tileX + random()) * size,
      y: (tileY + random()) * size,
      brightness,
      radius: 0.45 + brightness * 1.1,
      colour: STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]!,
    });
  }
  return stars;
}

export function galaxiesInTile(tileX: number, tileY: number, seed: number): Galaxy[] {
  const random = seededRandom(tileSeed(tileX, tileY, seed ^ 0x9e3779b9));
  if (random() > GALAXY_CHANCE) {
    return [];
  }
  return [
    {
      x: (tileX + 0.15 + random() * 0.7) * GALAXY_TILE,
      y: (tileY + 0.15 + random() * 0.7) * GALAXY_TILE,
      radius: 5 + random() * 9,
      flatten: 0.3 + random() * 0.45,
      angle: random() * Math.PI,
      tint: GALAXY_TINTS[Math.floor(random() * GALAXY_TINTS.length)]!,
      opacity: 0.1 + random() * 0.12,
    },
  ];
}

/** The inclusive range of tile indices covering a span of world coordinates. */
export function tileRange(min: number, max: number, tileSize: number): [number, number] {
  return [Math.floor(min / tileSize), Math.floor(max / tileSize)];
}

/** The faintest star worth drawing at a zoom level; more stars appear as the view zooms in. */
export function brightnessCutoff(zoom: number): number {
  if (zoom >= 12) {
    return 0;
  }
  return Math.min(0.75, (12 - zoom) / 12);
}

/** Side of a nebula tile at a level of detail, in mu. */
export function nebulaTileSize(level: number): number {
  return NEBULA_TILE * 2 ** level;
}

/** The coarsest nebula level needed to keep at most `MAX_NEBULA_TILES_ACROSS` tiles across `visibleWidth` mu. */
export function nebulaLevel(visibleWidth: number): number {
  const tiles = visibleWidth / NEBULA_TILE;
  if (!(tiles > MAX_NEBULA_TILES_ACROSS)) {
    return 0;
  }
  return Math.ceil(Math.log2(tiles / MAX_NEBULA_TILES_ACROSS));
}

/**
 * The faint blue clouds in a nebula tile, if it has one: a few overlapping
 * blobs around a centre, so the cloud has an irregular shape. Most of space
 * stays clear. Blobs reach well beyond their tile, so draw the tiles around
 * the view as well.
 */
export function nebulaInTile(tileX: number, tileY: number, seed: number, level = 0): NebulaBlob[] {
  const size = nebulaTileSize(level);
  const random = seededRandom(tileSeed(tileX, tileY, (seed ^ 0x51ed270b) + Math.imul(level, 0x2545f491)));
  if (random() > NEBULA_CHANCE) {
    return [];
  }
  const centreX = (tileX + 0.2 + random() * 0.6) * size;
  const centreY = (tileY + 0.2 + random() * 0.6) * size;
  const count = 3 + Math.floor(random() * 4);
  const blobs: NebulaBlob[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = random() * size * 0.35;
    blobs.push({
      x: centreX + Math.cos(angle) * distance,
      y: centreY + Math.sin(angle) * distance,
      radius: size * (0.22 + random() * 0.33),
      tint: NEBULA_TINTS[Math.floor(random() * NEBULA_TINTS.length)]!,
      opacity: 0.045 + random() * 0.06,
    });
  }
  return blobs;
}
