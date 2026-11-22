import { courseToDegrees, type Vec2 } from '../rules/course';
import { designOf, type GameState } from '../game/state';
import { hullBoxes } from '../rules/fire';
import type { AnimatedPose } from './animate';
import type { FireEnvelope } from './fireEnvelope';
import type { Camera, Projection, Viewport } from './projection';

/**
 * A renderer-neutral description of what is on the table. Positions are on
 * the game plane in mu and headings are degrees clockwise from north, so any
 * renderer (overhead canvas, isometric, 3D) can draw the same scene.
 */
export type ShipSizeClass = 'small' | 'medium' | 'large';

/** A ship's size class, from its SSD size: 1–2 small, 3–4 medium, 5 large. */
export function sizeClassOf(ssdSize: number): ShipSizeClass {
  return ssdSize <= 2 ? 'small' : ssdSize <= 4 ? 'medium' : 'large';
}

export interface SceneShip {
  id: string;
  label: string;
  position: Vec2;
  heading: number;
  /** Sprite path relative to the assets folder. */
  sprite: string;
  /** Length on the map in mu. */
  length: number;
  colour: string;
  selected: boolean;
  /** The share of its hull boxes the ship has left, from 0 to 1, shown as the bar above it. */
  strength: number;
  /** Small for frigates and destroyers, medium for cruisers, large for the battlecruiser. */
  sizeClass: ShipSizeClass;
  /**
   * How to draw the ship while a firing ship is choosing a target: `target`
   * if it can be fired at, `dimmed` if it can't, otherwise `normal`.
   */
  emphasis: 'normal' | 'target' | 'dimmed';
  /** Out of reach of every enemy after the last move: it leaves the battle unless it closes in. */
  leaving: boolean;
}

/** A ship blowing up, `progress` running from 0 to 1. */
export interface SceneExplosion {
  position: Vec2;
  /** Size of the ship that exploded, in mu. */
  length: number;
  progress: number;
}

/** A line from a firing ship to its target, with the range. */
export interface SceneTargetLine {
  from: Vec2;
  to: Vec2;
  /** Lengths of the two ships in mu, so the line can stop at their rings. */
  fromLength: number;
  toLength: number;
  label: string;
}

export interface SceneTrail {
  shipId: string;
  colour: string;
  points: Vec2[];
}

export interface Scene {
  ships: SceneShip[];
  trails: SceneTrail[];
  /** The selected firing ship's weapon reach, or null. */
  fireEnvelope?: FireEnvelope | null;
  explosions?: SceneExplosion[];
  /** The line from a firing ship to the target on show, or null. */
  targetLine?: SceneTargetLine | null;
  /** Milliseconds, for anything that pulses. */
  time?: number;
}

export interface SceneOptions {
  selectedShipId?: string | null;
  /** Poses that replace ships' stored positions, used while a move is animating. */
  poses?: Readonly<Record<string, AnimatedPose>>;
  /** Paths to draw behind ships, by ship id. */
  trails?: Readonly<Record<string, Vec2[]>>;
  /** Ships that can be fired at now; when set, every other ship is dimmed. */
  targetIds?: ReadonlySet<string> | null;
  fireEnvelope?: FireEnvelope | null;
  explosions?: SceneExplosion[];
  targetLine?: SceneTargetLine | null;
  time?: number;
}

export function buildScene(state: GameState, options: SceneOptions = {}): Scene {
  const colours = new Map(state.players.map((player) => [player.id, player.colour]));
  const ships: SceneShip[] = [];
  const trails: SceneTrail[] = [];

  for (const ship of state.ships) {
    const colour = colours.get(ship.playerId) ?? '#ffffff';
    const trail = options.trails?.[ship.id];
    if (trail !== undefined && trail.length > 1) {
      trails.push({ shipId: ship.id, colour, points: trail });
    }
    const design = designOf(state, ship);
    const pose = options.poses?.[ship.id];
    ships.push({
      id: ship.id,
      label: ship.id,
      position: pose?.position ?? ship.position,
      heading: pose?.heading ?? courseToDegrees(ship.course),
      sprite: design.sprite,
      length: design.length,
      colour,
      selected: options.selectedShipId === ship.id,
      strength: strengthOf(ship.hullDamage, hullBoxes(design)),
      sizeClass: sizeClassOf(design.ssd.size),
      emphasis: emphasisFor(ship.id, options),
      leaving: state.leaving.includes(ship.id),
    });
  }

  return {
    ships,
    trails,
    fireEnvelope: options.fireEnvelope ?? null,
    explosions: options.explosions ?? [],
    targetLine: options.targetLine ?? null,
    time: options.time ?? 0,
  };
}

/** The share of `boxes` hull boxes not crossed out, from 0 to 1. */
function strengthOf(hullDamage: number, boxes: number): number {
  return boxes <= 0 ? 1 : Math.min(1, Math.max(0, 1 - hullDamage / boxes));
}

function emphasisFor(shipId: string, options: SceneOptions): SceneShip['emphasis'] {
  const targets = options.targetIds;
  if (targets === null || targets === undefined || shipId === options.selectedShipId) {
    return 'normal';
  }
  return targets.has(shipId) ? 'target' : 'dimmed';
}

/** Smallest radius, in pixels, that a ship is drawn or clicked at, however far out the view is. */
export const MIN_SHIP_RADIUS_PX = 13;

/** A ship's base ring is this many times its length across its radius. */
export const SHIP_RING_SCALE = 0.62;

/** Radius of a ship's base ring on the game plane, in mu. */
export function shipRadiusMu(length: number): number {
  return length * SHIP_RING_SCALE;
}

/** Radius of a ship's base ring on screen, in pixels. */
export function shipRadiusPx(ship: SceneShip, camera: Camera): number {
  return Math.max(MIN_SHIP_RADIUS_PX, shipRadiusMu(ship.length) * camera.zoom);
}

/** The ship under a screen point, if any. The nearest ship wins when several overlap. */
export function pickShip(
  scene: Scene,
  screenPoint: Vec2,
  camera: Camera,
  viewport: Viewport,
  projection: Projection,
): SceneShip | null {
  let best: SceneShip | null = null;
  let bestDistance = Infinity;
  for (const ship of scene.ships) {
    const centre = projection.worldToScreen(ship.position, camera, viewport);
    const distance = Math.hypot(centre.x - screenPoint.x, centre.y - screenPoint.y);
    if (distance <= shipRadiusPx(ship, camera) + 4 && distance < bestDistance) {
      best = ship;
      bestDistance = distance;
    }
  }
  return best;
}
