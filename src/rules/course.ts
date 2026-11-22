/**
 * Courses are the twelve "clock face" headings from the rules. The clock is
 * fixed to the map: course 12 points north (up the screen), 3 east,
 * 6 south and 9 west.
 *
 * World coordinates are a flat 2D plane measured in mu, with x increasing to
 * the east and y increasing to the south.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const COURSE_COUNT = 12;
export const DEGREES_PER_POINT = 360 / COURSE_COUNT;

export function isCourse(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= COURSE_COUNT;
}

/** Wraps any integer onto the clock face, 1 to 12. */
export function normaliseCourse(value: number): number {
  const wrapped = ((value % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT;
  return wrapped === 0 ? COURSE_COUNT : wrapped;
}

/** Turns by a number of course points. Positive is starboard (clockwise), negative is port. */
export function turnCourse(course: number, points: number): number {
  return normaliseCourse(course + points);
}

/** Heading in degrees clockwise from north. Course 12 is 0, course 3 is 90. */
export function courseToDegrees(course: number): number {
  return (normaliseCourse(course) % COURSE_COUNT) * DEGREES_PER_POINT;
}

/** Unit vector for a heading given in degrees clockwise from north. */
export function headingVector(degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/** Unit vector for a course. */
export function courseVector(course: number): Vec2 {
  return headingVector(courseToDegrees(course));
}
