import { courseVector } from '../rules/course';
import { svg } from './dom';

/** A small clock face showing which way each course points on the map, shown in the Movement orders panel while plotting. */
export function renderCourseClock(container: HTMLElement): void {
  const root = svg('svg', { viewBox: '-52 -52 104 104', role: 'img' });
  root.append(
    svg('circle', { r: 50, fill: 'rgba(8, 12, 24, 0.7)', stroke: 'rgba(140, 175, 255, 0.5)', 'stroke-width': 1 }),
    svg('circle', { r: 27, fill: 'none', stroke: 'rgba(140, 175, 255, 0.25)', 'stroke-width': 1 }),
  );
  for (let course = 1; course <= 12; course += 1) {
    const direction = courseVector(course);
    const label = svg(
      'text',
      {
        x: direction.x * 39,
        y: direction.y * 39,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': course % 3 === 0 ? 15 : 13,
        'font-weight': course % 3 === 0 ? 700 : 400,
        fill: course % 3 === 0 ? '#ffffff' : '#a9b8d8',
        'font-family': 'system-ui, sans-serif',
      },
      String(course),
    );
    root.append(
      svg('line', {
        x1: direction.x * 22,
        y1: direction.y * 22,
        x2: direction.x * 27,
        y2: direction.y * 27,
        stroke: 'rgba(140, 175, 255, 0.6)',
        'stroke-width': 1,
      }),
      label,
    );
  }
  root.append(
    svg(
      'text',
      {
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 10.5,
        'font-weight': 600,
        fill: '#8794b0',
        'font-family': 'system-ui, sans-serif',
      },
      'COURSE',
    ),
  );
  container.replaceChildren(root);
}
