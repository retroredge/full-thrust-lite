import { headingVector, type Vec2 } from '../rules/course';
import type { Camera, Projection, Viewport } from './projection';
import type { BoardRenderer } from './renderer';
import { arcBoundaries, sectorOutline, type FireEnvelope } from './fireEnvelope';
import {
  MIN_SHIP_RADIUS_PX,
  shipRadiusMu,
  shipRadiusPx,
  type Scene,
  type SceneExplosion,
  type SceneShip,
  type SceneTargetLine,
  type ShipSizeClass,
} from './scene';
import {
  GALAXY_TILE,
  MIN_GALAXY_ZOOM,
  brightnessCutoff,
  galaxiesInTile,
  nebulaInTile,
  nebulaLevel,
  nebulaTileSize,
  starLevel,
  starTileSize,
  starsInTile,
  tileRange,
  type Galaxy,
  type NebulaBlob,
  type Star,
} from './starfield';

const BACKDROP_SEED = 20261111;
/** Chosen so a couple of nebulae fall across the scenarios' starting area. */
const NEBULA_SEED = 20261120;
const SPACE_COLOUR = '#05070f';
/** Lengths the scale bar can show, in mu, and the most screen it may take. */
const SCALE_LENGTHS = [1, 2, 3, 6, 12, 24, 48, 96, 192, 384] as const;
const SCALE_MAX_PX = 160;
/** The scale bar shows 12 mu, the range bands' width, whenever that is between these lengths in px. */
const SCALE_PREFERRED_MU = 12;
const SCALE_PREFERRED_MIN_PX = 30;
const SCALE_PREFERRED_MAX_PX = 400;
/** The line under the name of a ship that is out of reach and about to leave the battle, and its colour (`--leaving` in the CSS). */
const LEAVING_LABEL = 'Leaving';
const LEAVING_COLOUR = '#f0b040';
/** A ship's sprite is drawn this many times its base ring's radius long. */
const SPRITE_SCALE = 1.7;
/** Space between the top of a ship's base ring and its strength bar, in px: clear of the heading tick and the pulsing rings. */
const STRENGTH_BAR_GAP = 12;
/** The strength bar's colour, and its height in px for each size of ship. */
const STRENGTH_COLOUR = '#ffd65c';
const STRENGTH_BAR_HEIGHT: Record<ShipSizeClass, number> = { small: 1, medium: 3, large: 5 };
/** The pulsing dashed ring round the selected ship, as [red, green, blue]. */
const SELECTED_RING_RGB = '77, 163, 255';
/** The line from a firing ship to its target. */
const TARGET_LINE_COLOUR = '#ffd84a';
/** Pulse torpedo reach: an orange dash-dot arc, so it can't be mistaken for a beam ring. */
const TORPEDO_REACH_COLOUR = '#ff9a3c';

/** Overhead view drawn on a 2D canvas. */
export class CanvasRenderer implements BoardRenderer {
  viewport: Viewport = { width: 1, height: 1 };

  private readonly context: CanvasRenderingContext2D;
  private readonly sprites = new Map<string, HTMLImageElement>();
  private readonly starTiles = new Map<string, Star[]>();
  private readonly galaxyTiles = new Map<string, Galaxy[]>();
  private readonly nebulaTiles = new Map<string, NebulaBlob[]>();

  /**
   * @param assetsUrl folder that sprite paths are relative to, ending in "/"
   * @param onAssetLoaded called when a sprite finishes loading, so the caller can redraw
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly projection: Projection,
    private readonly assetsUrl: string,
    private readonly onAssetLoaded: () => void,
  ) {
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('This browser cannot draw the map (no 2D canvas support).');
    }
    this.context = context;
    this.resize();
  }

  resize(): boolean {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    const changed =
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight ||
      this.viewport.width !== width ||
      this.viewport.height !== height;
    if (changed) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.viewport = { width, height };
    }
    return changed;
  }

  render(scene: Scene, camera: Camera): void {
    const context = this.context;
    const ratio = this.canvas.width / this.viewport.width;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = SPACE_COLOUR;
    context.fillRect(0, 0, this.viewport.width, this.viewport.height);

    this.drawBackdrop(camera);
    if (scene.fireEnvelope) {
      this.drawFireEnvelope(scene.fireEnvelope, camera);
    }
    for (const trail of scene.trails) {
      this.drawTrail(trail.points, trail.colour, camera);
    }
    if (scene.targetLine) {
      this.drawTargetLine(scene.targetLine, camera);
    }
    // Draw the selected ship last so it sits on top of any ship it overlaps.
    const ordered = [...scene.ships].sort((a, b) => Number(a.selected) - Number(b.selected));
    for (const ship of ordered) {
      this.drawShip(ship, camera, scene.time ?? 0);
    }
    for (const explosion of scene.explosions ?? []) {
      this.drawExplosion(explosion, camera);
    }
    this.drawScaleBar(camera);
  }

  /**
   * A bright yellow line from a firing ship to its target, from ring to ring,
   * with an arrowhead and the range in a label halfway along.
   */
  private drawTargetLine(line: SceneTargetLine, camera: Camera): void {
    const context = this.context;
    const from = this.toScreen(line.from, camera);
    const to = this.toScreen(line.to, camera);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const ring = (shipLength: number) => Math.max(MIN_SHIP_RADIUS_PX, shipRadiusMu(shipLength) * camera.zoom);
    const startGap = ring(line.fromLength) + 3;
    const endGap = ring(line.toLength) + 4;
    if (length <= startGap + endGap + 12) {
      return;
    }
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    const start = { x: from.x + ux * startGap, y: from.y + uy * startGap };
    const tip = { x: to.x - ux * endGap, y: to.y - uy * endGap };
    const head = 12;
    const base = { x: tip.x - ux * head, y: tip.y - uy * head };

    context.save();
    context.strokeStyle = TARGET_LINE_COLOUR;
    context.fillStyle = TARGET_LINE_COLOUR;
    context.shadowColor = TARGET_LINE_COLOUR;
    context.shadowBlur = 10;
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(base.x, base.y);
    context.stroke();
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(base.x - uy * 6, base.y + ux * 6);
    context.lineTo(base.x + uy * 6, base.y - ux * 6);
    context.closePath();
    context.fill();

    // The range, in a dark pill halfway along.
    context.shadowBlur = 0;
    context.font = '700 12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const middle = { x: (start.x + tip.x) / 2, y: (start.y + tip.y) / 2 };
    const width = context.measureText(line.label).width + 14;
    context.beginPath();
    context.roundRect(middle.x - width / 2, middle.y - 10, width, 20, 10);
    context.fillStyle = 'rgba(5, 7, 15, 0.88)';
    context.fill();
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = '#fff4c8';
    context.fillText(line.label, middle.x, middle.y + 0.5);
    context.restore();
  }

  /**
   * A scale bar in the bottom right corner, a round number of mu long, so
   * players can judge distances at the current zoom.
   */
  private drawScaleBar(camera: Camera): void {
    const context = this.context;
    const origin = this.toScreen({ x: 0, y: 0 }, camera);
    const east = this.toScreen({ x: 1, y: 0 }, camera);
    const pxPerMu = Math.hypot(east.x - origin.x, east.y - origin.y);
    if (!(pxPerMu > 0)) {
      return;
    }
    // 12 mu where it fits, otherwise the longest round length that fits in about 160 px.
    const preferredPx = SCALE_PREFERRED_MU * pxPerMu;
    const length =
      preferredPx >= SCALE_PREFERRED_MIN_PX && preferredPx <= Math.min(SCALE_PREFERRED_MAX_PX, this.viewport.width * 0.45)
        ? SCALE_PREFERRED_MU
        : ([...SCALE_LENGTHS].reverse().find((mu) => mu * pxPerMu <= SCALE_MAX_PX) ?? SCALE_LENGTHS[0]!);
    const width = length * pxPerMu;
    const segments = length % 3 === 0 && length >= 3 ? 3 : 2;
    const right = this.viewport.width - 16;
    const bottom = this.viewport.height - 16;
    const left = right - width;
    const barTop = bottom - 6;

    context.save();
    context.fillStyle = 'rgba(5, 7, 15, 0.6)';
    context.fillRect(left - 10, bottom - 30, width + 20, 38);
    // Alternate filled and hollow segments, like a map scale.
    context.strokeStyle = 'rgba(225, 232, 255, 0.85)';
    context.lineWidth = 1;
    for (let index = 0; index < segments; index += 1) {
      const x = left + (width * index) / segments;
      if (index % 2 === 0) {
        context.fillStyle = 'rgba(225, 232, 255, 0.85)';
        context.fillRect(x, barTop, width / segments, 6);
      }
    }
    context.strokeRect(left + 0.5, barTop + 0.5, width - 1, 5);
    context.font = '600 12px system-ui, sans-serif';
    context.fillStyle = 'rgba(225, 232, 255, 0.95)';
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fillText('0', left, barTop - 5);
    context.textAlign = 'right';
    context.fillText(`${length} mu`, right, barTop - 5);
    context.restore();
  }

  /**
   * A firing ship's reach: each 12 mu band shaded in the arcs its beams
   * cover there, fading with range, with dashed range rings labelled in mu,
   * and the torpedoes' reach as an orange arc.
   */
  private drawFireEnvelope(envelope: FireEnvelope, camera: Camera): void {
    const context = this.context;
    context.save();
    envelope.bands.forEach((band, index) => {
      context.fillStyle = withAlpha(envelope.colour, 0.2 - index * 0.045);
      for (const arc of band.arcs) {
        const outline = sectorOutline(envelope, arc, band.inner, band.outer).map((point) => this.toScreen(point, camera));
        context.beginPath();
        outline.forEach((point, pointIndex) =>
          pointIndex === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
        );
        context.closePath();
        context.fill();
      }
    });

    const centre = this.toScreen(envelope.centre, camera);
    context.strokeStyle = withAlpha(envelope.colour, 0.75);
    context.lineWidth = 1;
    context.setLineDash([4, 6]);
    context.font = '600 12px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (const band of envelope.bands) {
      // Rings go through the projection point by point, so they stay right in any view.
      const ring = Array.from({ length: 121 }, (_, step) => {
        const radians = (step / 120) * Math.PI * 2;
        return this.toScreen(
          { x: envelope.centre.x + Math.sin(radians) * band.outer, y: envelope.centre.y - Math.cos(radians) * band.outer },
          camera,
        );
      });
      context.beginPath();
      ring.forEach((point, step) => (step === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
      context.stroke();

      // Label each ring where it crosses north of the ship.
      const label = this.toScreen({ x: envelope.centre.x, y: envelope.centre.y - band.outer }, camera);
      const text = `${band.outer} mu`;
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(5, 7, 15, 0.85)';
      context.setLineDash([]);
      context.strokeText(text, label.x + 4, label.y - 7);
      context.fillStyle = withAlpha(envelope.colour, 0.95);
      context.fillText(text, label.x + 4, label.y - 7);
      context.strokeStyle = withAlpha(envelope.colour, 0.75);
      context.lineWidth = 1;
      context.setLineDash([4, 6]);
    }
    if (envelope.torpedo !== null) {
      this.drawTorpedoReach(envelope, envelope.torpedo, camera);
    }
    // Dotted lines between the fire arcs, out to the edge of the reach.
    context.strokeStyle = withAlpha(envelope.colour, 0.6);
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    context.setLineDash([0.5, 5]);
    for (const [from, to] of arcBoundaries(envelope)) {
      const start = this.toScreen(from, camera);
      const end = this.toScreen(to, camera);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    context.setLineDash([]);
    context.beginPath();
    context.arc(centre.x, centre.y, 2, 0, Math.PI * 2);
    context.fillStyle = envelope.colour;
    context.fill();
    context.restore();
  }

  /** The pulse torpedoes' reach: a dash-dot arc at 30 mu across their arcs only, labelled at the first. */
  private drawTorpedoReach(envelope: FireEnvelope, torpedo: NonNullable<FireEnvelope['torpedo']>, camera: Camera): void {
    const context = this.context;
    context.save();
    context.strokeStyle = TORPEDO_REACH_COLOUR;
    context.lineWidth = 1.75;
    context.setLineDash([9, 4, 2, 4]);
    for (const arc of torpedo.arcs) {
      // The outer edge of a pie slice is the arc itself; leave out the centre point.
      const edge = sectorOutline(envelope, arc, 0, torpedo.range, 2)
        .slice(1)
        .map((point) => this.toScreen(point, camera));
      context.beginPath();
      edge.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
      context.stroke();
    }
    const first = torpedo.arcs[0];
    if (first !== undefined) {
      const edge = sectorOutline(envelope, first, 0, torpedo.range + 2.5, 30).slice(1);
      const label = this.toScreen(edge[1] ?? edge[0]!, camera);
      const text = `${torpedo.range} mu torpedoes`;
      context.setLineDash([]);
      context.font = '600 12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(5, 7, 15, 0.85)';
      context.strokeText(text, label.x, label.y);
      context.fillStyle = TORPEDO_REACH_COLOUR;
      context.fillText(text, label.x, label.y);
    }
    context.restore();
  }

  /** A flash and an expanding, fading fireball where a ship was destroyed. */
  private drawExplosion(explosion: SceneExplosion, camera: Camera): void {
    const context = this.context;
    const centre = this.toScreen(explosion.position, camera);
    const size = Math.max(14, explosion.length * camera.zoom);
    const t = explosion.progress;
    context.save();
    const radius = size * (0.4 + t * 1.6);
    const gradient = context.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
    gradient.addColorStop(0, `rgba(255, 255, 230, ${Math.max(0, 1 - t * 1.4)})`);
    gradient.addColorStop(0.35, `rgba(255, 190, 70, ${Math.max(0, 0.9 - t)})`);
    gradient.addColorStop(0.7, `rgba(230, 70, 30, ${Math.max(0, 0.6 - t * 0.7)})`);
    gradient.addColorStop(1, 'rgba(230, 70, 30, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    context.fill();
    // Shock ring.
    context.strokeStyle = `rgba(255, 220, 160, ${Math.max(0, 0.8 - t)})`;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centre.x, centre.y, size * (0.6 + t * 2.4), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  private toScreen(point: Vec2, camera: Camera): Vec2 {
    return this.projection.worldToScreen(point, camera, this.viewport);
  }

  /** The world rectangle that covers the screen, from the four screen corners. */
  private visibleWorld(camera: Camera): { minX: number; minY: number; maxX: number; maxY: number } {
    const corners = [
      { x: 0, y: 0 },
      { x: this.viewport.width, y: 0 },
      { x: 0, y: this.viewport.height },
      { x: this.viewport.width, y: this.viewport.height },
    ].map((corner) => this.projection.screenToWorld(corner, camera, this.viewport));
    return {
      minX: Math.min(...corners.map((corner) => corner.x)),
      minY: Math.min(...corners.map((corner) => corner.y)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      maxY: Math.max(...corners.map((corner) => corner.y)),
    };
  }

  private drawBackdrop(camera: Camera): void {
    const context = this.context;
    const visible = this.visibleWorld(camera);

    // Faint blue nebulae first, behind everything. Clouds spill over their
    // tiles, so take in a tile beyond each edge of the view.
    const nebulaLod = nebulaLevel(visible.maxX - visible.minX);
    const nebulaTile = nebulaTileSize(nebulaLod);
    const [nebulaMinX, nebulaMaxX] = tileRange(visible.minX - nebulaTile, visible.maxX + nebulaTile, nebulaTile);
    const [nebulaMinY, nebulaMaxY] = tileRange(visible.minY - nebulaTile, visible.maxY + nebulaTile, nebulaTile);
    for (let tileX = nebulaMinX; tileX <= nebulaMaxX; tileX += 1) {
      for (let tileY = nebulaMinY; tileY <= nebulaMaxY; tileY += 1) {
        const key = `${nebulaLod}:${tileX},${tileY}`;
        let blobs = this.nebulaTiles.get(key);
        if (blobs === undefined) {
          blobs = nebulaInTile(tileX, tileY, NEBULA_SEED, nebulaLod);
          this.nebulaTiles.set(key, blobs);
        }
        for (const blob of blobs) {
          this.drawNebulaBlob(blob, camera);
        }
      }
    }

    // Far out, galaxies would be a pixel or two across, so leave them out.
    const showGalaxies = camera.zoom >= MIN_GALAXY_ZOOM;
    const [galaxyMinX, galaxyMaxX] = tileRange(visible.minX - GALAXY_TILE, visible.maxX + GALAXY_TILE, GALAXY_TILE);
    const [galaxyMinY, galaxyMaxY] = tileRange(visible.minY - GALAXY_TILE, visible.maxY + GALAXY_TILE, GALAXY_TILE);
    for (let tileX = galaxyMinX; showGalaxies && tileX <= galaxyMaxX; tileX += 1) {
      for (let tileY = galaxyMinY; tileY <= galaxyMaxY; tileY += 1) {
        const key = `${tileX},${tileY}`;
        let galaxies = this.galaxyTiles.get(key);
        if (galaxies === undefined) {
          galaxies = galaxiesInTile(tileX, tileY, BACKDROP_SEED);
          this.galaxyTiles.set(key, galaxies);
        }
        for (const galaxy of galaxies) {
          this.drawGalaxy(galaxy, camera);
        }
      }
    }

    const cutoff = brightnessCutoff(camera.zoom);
    const sizeScale = Math.min(1.5, Math.max(0.7, Math.sqrt(camera.zoom / 12)));
    const level = starLevel(visible.maxX - visible.minX);
    const tileSize = starTileSize(level);
    const [starMinX, starMaxX] = tileRange(visible.minX, visible.maxX, tileSize);
    const [starMinY, starMaxY] = tileRange(visible.minY, visible.maxY, tileSize);
    for (let tileX = starMinX; tileX <= starMaxX; tileX += 1) {
      for (let tileY = starMinY; tileY <= starMaxY; tileY += 1) {
        const key = `${level}:${tileX},${tileY}`;
        let stars = this.starTiles.get(key);
        if (stars === undefined) {
          stars = starsInTile(tileX, tileY, BACKDROP_SEED, level);
          this.starTiles.set(key, stars);
        }
        for (const star of stars) {
          if (star.brightness < cutoff) {
            continue;
          }
          const screen = this.toScreen(star, camera);
          context.globalAlpha = 0.25 + star.brightness * 0.6;
          context.fillStyle = star.colour;
          context.beginPath();
          context.arc(screen.x, screen.y, star.radius * sizeScale, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.globalAlpha = 1;

    // Keep the tile caches from growing without limit during long pans.
    if (this.starTiles.size > 4000) {
      this.starTiles.clear();
    }
    if (this.galaxyTiles.size > 4000) {
      this.galaxyTiles.clear();
    }
    if (this.nebulaTiles.size > 4000) {
      this.nebulaTiles.clear();
    }
  }

  /** One cloud of a nebula: a soft blue glow, brightest in the middle. */
  private drawNebulaBlob(blob: NebulaBlob, camera: Camera): void {
    const context = this.context;
    const centre = this.toScreen(blob, camera);
    const radius = blob.radius * camera.zoom;
    if (
      radius < 2 ||
      centre.x + radius < 0 ||
      centre.y + radius < 0 ||
      centre.x - radius > this.viewport.width ||
      centre.y - radius > this.viewport.height
    ) {
      return;
    }
    const [red, green, blue] = blob.tint;
    const glow = context.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
    glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${blob.opacity})`);
    glow.addColorStop(0.45, `rgba(${red}, ${green}, ${blue}, ${blob.opacity * 0.55})`);
    glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawGalaxy(galaxy: Galaxy, camera: Camera): void {
    const context = this.context;
    const centre = this.toScreen(galaxy, camera);
    const radius = galaxy.radius * camera.zoom;
    if (
      centre.x + radius < 0 ||
      centre.y + radius < 0 ||
      centre.x - radius > this.viewport.width ||
      centre.y - radius > this.viewport.height
    ) {
      return;
    }
    const [red, green, blue] = galaxy.tint;
    context.save();
    context.translate(centre.x, centre.y);
    context.rotate(galaxy.angle);
    context.scale(1, galaxy.flatten);
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, `rgba(255, 250, 240, ${galaxy.opacity * 1.6})`);
    glow.addColorStop(0.12, `rgba(${red}, ${green}, ${blue}, ${galaxy.opacity})`);
    glow.addColorStop(0.5, `rgba(${red}, ${green}, ${blue}, ${galaxy.opacity * 0.35})`);
    glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawTrail(points: Vec2[], colour: string, camera: Camera): void {
    const context = this.context;
    const screen = points.map((point) => this.toScreen(point, camera));
    context.save();
    context.globalAlpha = 0.5;
    context.strokeStyle = colour;
    context.lineWidth = 1.5;
    context.lineJoin = 'round';
    context.setLineDash([3, 5]);
    context.beginPath();
    screen.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colour;
    const start = screen[0]!;
    context.beginPath();
    context.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawShip(ship: SceneShip, camera: Camera, time: number): void {
    const context = this.context;
    const centre = this.toScreen(ship.position, camera);
    const radius = shipRadiusPx(ship, camera);

    // Pulsing dashed rings outside the base: yellow for a ship that can be
    // fired at, blue for the selected ship.
    const pulse = (Math.sin(time / 260) + 1) / 2;
    const pulseRing = (rgb: string, width: number): void => {
      context.save();
      context.beginPath();
      context.arc(centre.x, centre.y, radius + 5 + pulse * 4, 0, Math.PI * 2);
      context.strokeStyle = `rgba(${rgb}, ${0.55 + pulse * 0.45})`;
      context.lineWidth = width;
      context.setLineDash([6, 4]);
      context.stroke();
      context.restore();
    };
    if (ship.emphasis === 'target') {
      pulseRing('255, 214, 92', 2);
    }
    if (ship.selected) {
      pulseRing(SELECTED_RING_RGB, 2.5);
    }

    // The on-screen direction of the heading comes from projecting a point
    // ahead of the ship, so this also holds for non-overhead projections.
    const direction = headingVector(ship.heading);
    const ahead = this.toScreen({ x: ship.position.x + direction.x, y: ship.position.y + direction.y }, camera);
    const screenAngle = Math.atan2(ahead.y - centre.y, ahead.x - centre.x);

    context.save();
    context.translate(centre.x, centre.y);
    if (ship.emphasis === 'dimmed') {
      context.globalAlpha = 0.4;
    }

    // Base ring in the player's colour.
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fillStyle = withAlpha(ship.colour, ship.selected ? 0.22 : 0.1);
    context.fill();
    context.lineWidth = ship.selected ? 2 : 1.25;
    context.strokeStyle = withAlpha(ship.colour, ship.selected ? 1 : 0.9);
    if (ship.selected) {
      context.shadowColor = ship.colour;
      context.shadowBlur = 12;
    }
    context.stroke();
    context.shadowBlur = 0;

    // Heading tick on the ring.
    context.save();
    context.rotate(screenAngle);
    context.beginPath();
    context.moveTo(radius, 0);
    context.lineTo(radius + 6, 0);
    context.strokeStyle = ship.colour;
    context.lineWidth = 2;
    context.stroke();
    context.restore();

    // Sprite art points north, so add a quarter turn to the screen angle.
    const sprite = this.sprite(ship.sprite);
    context.save();
    context.rotate(screenAngle + Math.PI / 2);
    const spriteLength = radius * SPRITE_SCALE;
    if (sprite !== null) {
      const spriteWidth = spriteLength * (sprite.naturalWidth / sprite.naturalHeight);
      context.drawImage(sprite, -spriteWidth / 2, -spriteLength / 2, spriteWidth, spriteLength);
    } else {
      // Plain arrowhead while the sprite loads, or if it is missing.
      context.beginPath();
      context.moveTo(0, -spriteLength / 2);
      context.lineTo(spriteLength * 0.3, spriteLength / 2);
      context.lineTo(0, spriteLength * 0.3);
      context.lineTo(-spriteLength * 0.3, spriteLength / 2);
      context.closePath();
      context.fillStyle = '#c8d2e6';
      context.fill();
    }
    context.restore();

    // Label under the base.
    context.font = '600 12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(5, 7, 15, 0.85)';
    context.strokeText(ship.label, 0, radius + 8);
    context.fillStyle = ship.selected ? '#ffffff' : ship.colour;
    context.fillText(ship.label, 0, radius + 8);
    if (ship.leaving) {
      // A second line under the name: the ship leaves the battle unless it closes in.
      context.strokeText(LEAVING_LABEL, 0, radius + 23);
      context.fillStyle = LEAVING_COLOUR;
      context.fillText(LEAVING_LABEL, 0, radius + 23);
    }

    this.drawStrengthBar(ship, centre, radius);

    context.restore();
  }

  /**
   * A yellow bar above the ship, thicker for bigger ships, showing the hull boxes it has left: as long
   * as its sprite when undamaged, shortening from the right as boxes are
   * crossed out. It is drawn on whole pixels in screen space, so it stays
   * sharp and never turns with the ship.
   */
  private drawStrengthBar(ship: SceneShip, centre: Vec2, radius: number): void {
    const context = this.context;
    const full = Math.round(radius * SPRITE_SCALE);
    const left = Math.round(centre.x - full / 2);
    const height = STRENGTH_BAR_HEIGHT[ship.sizeClass];
    const top = Math.round(centre.y - radius - STRENGTH_BAR_GAP - height);
    context.save();
    // drawShip has moved the origin to the ship's centre; undo that to work on whole screen pixels.
    context.translate(-centre.x, -centre.y);
    context.fillStyle = STRENGTH_COLOUR;
    context.fillRect(left, top, Math.round(full * ship.strength), height);
    context.restore();
  }

  private sprite(path: string): HTMLImageElement | null {
    if (path === '') {
      return null;
    }
    let image = this.sprites.get(path);
    if (image === undefined) {
      image = new Image();
      image.addEventListener('load', () => this.onAssetLoaded());
      image.src = `${this.assetsUrl}${path}`;
      this.sprites.set(path, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
  }
}

/** Applies an opacity to a "#rrggbb" colour. Other colour formats are returned unchanged. */
export function withAlpha(colour: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (match === null) {
    return colour;
  }
  const [red, green, blue] = [match[1]!, match[2]!, match[3]!].map((part) => parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
