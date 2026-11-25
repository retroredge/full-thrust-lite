import type { Vec2 } from '../rules/course';

/** A press that moves less than this, in pixels, is a click rather than a drag. */
const DRAG_THRESHOLD_PX = 4;

export interface MapInputHandlers {
  /** A drag moved the pointer from `from` to `to`, in canvas pixels. */
  onPan(from: Vec2, to: Vec2): void;
  /** Zoom by `factor` about `point`, from a scroll, a trackpad pinch or a two-finger pinch. */
  onZoom(point: Vec2, factor: number): void;
  /** A click or tap (a press and release without dragging) at `point`; `touch` is true for a finger. */
  onClick(point: Vec2, touch: boolean): void;
}

/**
 * Turns pointer and wheel events on the map into pans, zooms and clicks: drag
 * to pan, scroll or pinch to zoom, click to pick. Listeners are removed when
 * `signal` aborts.
 */
export function bindMapInput(canvas: HTMLCanvasElement, signal: AbortSignal, handlers: MapInputHandlers): void {
  const pointers = new Map<number, Vec2>();
  let dragged = false;
  let pressedAt: Vec2 | null = null;
  let pinchDistance = 0;

  const position = (event: PointerEvent | WheelEvent): Vec2 => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, position(event));
      if (pointers.size === 1) {
        dragged = false;
        pressedAt = position(event);
      } else if (pointers.size === 2) {
        const [first, second] = [...pointers.values()] as [Vec2, Vec2];
        pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
        dragged = true;
      }
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (previous === undefined) {
        return;
      }
      const current = position(event);
      pointers.set(event.pointerId, current);

      if (pointers.size === 2) {
        const [first, second] = [...pointers.values()] as [Vec2, Vec2];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        if (pinchDistance > 0 && distance > 0) {
          handlers.onZoom(middle, distance / pinchDistance);
        }
        pinchDistance = distance;
        return;
      }

      if (!dragged && pressedAt !== null) {
        if (Math.hypot(current.x - pressedAt.x, current.y - pressedAt.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragged = true;
        canvas.classList.add('dragging');
      }
      handlers.onPan(previous, current);
    },
    { signal },
  );

  const release = (event: PointerEvent) => {
    const wasPressed = pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (wasPressed && !dragged && event.type === 'pointerup') {
        handlers.onClick(position(event), event.pointerType === 'touch');
      }
      pressedAt = null;
    }
  };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      // Trackpad pinches arrive as wheel events with ctrlKey set and small deltas.
      const sensitivity = event.ctrlKey ? 0.012 : 0.0018;
      handlers.onZoom(position(event), Math.exp(-event.deltaY * sensitivity));
    },
    { passive: false, signal },
  );
}
