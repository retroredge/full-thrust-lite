import type { Camera, Viewport } from './projection';
import type { Scene } from './scene';

/**
 * Draws a scene. The overhead canvas renderer is the only implementation for
 * now; an isometric or WebGL renderer can replace it without changes to the
 * rules, game state, animation or panels.
 */
export interface BoardRenderer {
  /** Current size of the drawing surface in CSS pixels. */
  readonly viewport: Viewport;
  /** Matches the drawing surface to its element's size. Returns true if the size changed. */
  resize(): boolean;
  render(scene: Scene, camera: Camera): void;
}
