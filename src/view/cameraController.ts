import type { Vec2 } from '../rules/course';
import { easeInOut } from './animate';
import {
  boundsOfCircles,
  centreOn,
  fitCamera,
  interpolateCamera,
  panByScreen,
  withMinimumSize,
  zoomAbout,
  type Circle,
} from './camera';
import type { Camera, Projection } from './projection';
import type { BoardRenderer } from './renderer';

/** How long a camera move (Fit all, a zoom button, centring on a ship) takes. */
const CAMERA_DURATION_MS = 280;
/**
 * Room kept clear around fitted ships, in pixels, beyond each ship's own
 * ring: enough for the heading tick and the ID label under the ring.
 */
const FIT_PADDING_PX = 30;
/** Fit all never zooms in closer than this, so a lone ship keeps some space around it. */
const FIT_MIN_WIDTH_MU = 36;
const FIT_MIN_HEIGHT_MU = 24;

/**
 * Where the map is looking, and how it gets there. Moves the game asks for
 * (fitting ships, the zoom buttons, centring on a ship) glide over a moment;
 * the player's own drags, pinches and scrolls take effect at once and cut any
 * glide short.
 */
export class CameraController {
  private current: Camera;
  private tween: { from: Camera; to: Camera; startedAt: number } | null = null;

  /**
   * @param onMove called when the camera starts moving, so the caller can draw frames until `update` says it has stopped
   */
  constructor(
    private readonly projection: Projection,
    private readonly renderer: BoardRenderer,
    private readonly onMove: () => void,
    initial: Camera = { centre: { x: 0, y: 0 }, zoom: 10 },
  ) {
    this.current = initial;
  }

  get camera(): Camera {
    return this.current;
  }

  /** The camera that shows every circle in full, as Fit all does, or null if there are none. */
  cameraToFit(circles: readonly Circle[]): Camera | null {
    const bounds = boundsOfCircles(circles);
    if (bounds === null) {
      return null;
    }
    // The map may have changed size (the target column opening or closing), so measure it afresh.
    this.renderer.resize();
    return fitCamera(
      this.projection,
      withMinimumSize(bounds, FIT_MIN_WIDTH_MU, FIT_MIN_HEIGHT_MU),
      this.renderer.viewport,
      FIT_PADDING_PX,
    );
  }

  /** Jumps straight to the view that fits every circle, with no glide. */
  jumpToFit(circles: readonly Circle[]): void {
    this.current = this.cameraToFit(circles) ?? this.current;
  }

  /** Glides to the view that fits every circle. */
  fit(circles: readonly Circle[]): void {
    const camera = this.cameraToFit(circles);
    if (camera !== null) {
      this.moveTo(camera);
    }
  }

  /** Glides to `target`. */
  moveTo(target: Camera): void {
    this.tween = { from: this.current, to: target, startedAt: performance.now() };
    this.onMove();
  }

  /** Glides to centre `point`, keeping the zoom. */
  centreOn(point: Vec2): void {
    this.moveTo(centreOn(this.current, point));
  }

  /** Glides in or out by `factor` about the middle of the map, as the zoom buttons do. */
  zoomBy(factor: number): void {
    const viewport = this.renderer.viewport;
    const middle = { x: viewport.width / 2, y: viewport.height / 2 };
    this.moveTo(zoomAbout(this.current, viewport, this.projection, middle, factor));
  }

  /** Zooms at once by `factor`, keeping the point under `screenPoint` still (a scroll or pinch). */
  zoomAt(screenPoint: Vec2, factor: number): void {
    this.tween = null;
    this.current = zoomAbout(this.current, this.renderer.viewport, this.projection, screenPoint, factor);
  }

  /** Pans at once so the point under `from` ends up under `to` (a drag). */
  pan(from: Vec2, to: Vec2): void {
    this.tween = null;
    this.current = panByScreen(this.current, this.renderer.viewport, this.projection, from, to);
  }

  /** Stops any glide where it is. */
  stop(): void {
    this.tween = null;
  }

  /** Moves any glide on to time `now`. Returns true while it is still under way. */
  update(now: number): boolean {
    if (this.tween === null) {
      return false;
    }
    const t = Math.min(1, (now - this.tween.startedAt) / CAMERA_DURATION_MS);
    this.current = interpolateCamera(this.tween.from, this.tween.to, easeInOut(t));
    if (t >= 1) {
      this.tween = null;
      return false;
    }
    return true;
  }
}
