import { describe, expect, it } from 'vitest';
import {
  COURSE_COUNT,
  DEGREES_PER_POINT,
  courseToDegrees,
  courseVector,
  headingVector,
  isCourse,
  normaliseCourse,
  turnCourse,
} from '../../src/rules/course';

describe('constants', () => {
  it('has twelve courses of 30 degrees each', () => {
    expect(COURSE_COUNT).toBe(12);
    expect(DEGREES_PER_POINT).toBe(30);
  });
});

describe('isCourse', () => {
  it('accepts integers 1 to 12', () => {
    for (let c = 1; c <= 12; c++) {
      expect(isCourse(c)).toBe(true);
    }
  });

  it('rejects out-of-range, fractional and non-number values', () => {
    for (const value of [0, 13, -1, 1.5, NaN, Infinity, '3', null, undefined, {}]) {
      expect(isCourse(value)).toBe(false);
    }
  });
});

describe('normaliseCourse', () => {
  it('leaves 1 to 12 unchanged', () => {
    for (let c = 1; c <= 12; c++) {
      expect(normaliseCourse(c)).toBe(c);
    }
  });

  it('maps zero to 12', () => {
    expect(normaliseCourse(0)).toBe(12);
  });

  it('wraps negative values', () => {
    expect(normaliseCourse(-1)).toBe(11);
    expect(normaliseCourse(-2)).toBe(10);
    expect(normaliseCourse(-11)).toBe(1);
    expect(normaliseCourse(-12)).toBe(12);
    expect(normaliseCourse(-13)).toBe(11);
    expect(normaliseCourse(-25)).toBe(11);
  });

  it('wraps large values', () => {
    expect(normaliseCourse(13)).toBe(1);
    expect(normaliseCourse(14)).toBe(2);
    expect(normaliseCourse(24)).toBe(12);
    expect(normaliseCourse(25)).toBe(1);
    expect(normaliseCourse(12 * 100 + 7)).toBe(7);
  });

  it('always returns a valid course', () => {
    for (let v = -50; v <= 50; v++) {
      expect(isCourse(normaliseCourse(v))).toBe(true);
    }
  });
});

describe('turnCourse', () => {
  it('turns to port (anticlockwise) with negative points', () => {
    expect(turnCourse(3, -2)).toBe(1);
    expect(turnCourse(1, -2)).toBe(11);
    expect(turnCourse(12, -1)).toBe(11);
  });

  it('turns to starboard (clockwise) with positive points', () => {
    expect(turnCourse(3, 2)).toBe(5);
    expect(turnCourse(11, 3)).toBe(2);
    expect(turnCourse(12, 1)).toBe(1);
  });

  it('does nothing with zero points', () => {
    expect(turnCourse(7, 0)).toBe(7);
    expect(turnCourse(12, 0)).toBe(12);
  });
});

describe('courseToDegrees', () => {
  it('gives the cardinal headings', () => {
    expect(courseToDegrees(12)).toBe(0);
    expect(courseToDegrees(3)).toBe(90);
    expect(courseToDegrees(6)).toBe(180);
    expect(courseToDegrees(9)).toBe(270);
  });

  it('gives 30 degrees per course point', () => {
    for (let c = 1; c <= 11; c++) {
      expect(courseToDegrees(c)).toBe(c * 30);
    }
  });

  it('normalises its input', () => {
    expect(courseToDegrees(0)).toBe(0);
    expect(courseToDegrees(15)).toBe(90);
    expect(courseToDegrees(-3)).toBe(270);
  });
});

describe('headingVector', () => {
  it('points north at 0 degrees and east at 90 degrees', () => {
    expect(headingVector(0).x).toBeCloseTo(0);
    expect(headingVector(0).y).toBeCloseTo(-1);
    expect(headingVector(90).x).toBeCloseTo(1);
    expect(headingVector(90).y).toBeCloseTo(0);
  });
});

describe('courseVector', () => {
  it('course 12 is north (negative y)', () => {
    const v = courseVector(12);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-1);
  });

  it('course 3 is east (positive x)', () => {
    const v = courseVector(3);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it('course 6 is south (positive y)', () => {
    const v = courseVector(6);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('course 9 is west (negative x)', () => {
    const v = courseVector(9);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
  });

  it('course 1 is 30 degrees clockwise of north', () => {
    const v = courseVector(1);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(-Math.sqrt(3) / 2);
  });

  it('is a unit vector for every course', () => {
    for (let c = 1; c <= 12; c++) {
      const v = courseVector(c);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    }
  });
});
