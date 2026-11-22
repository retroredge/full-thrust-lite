import { describe, expect, it } from 'vitest';
import { LOG_TURNS_KEPT, appendToLog, type LogEntry } from '../../src/game/log';

const entry = (turn: number, shipId = 'DD1', overrides: Partial<LogEntry> = {}): LogEntry => ({
  turn,
  shipId,
  shipName: 'Arrow',
  playerId: 'p1',
  order: '–',
  velocity: 6,
  course: 3,
  ...overrides,
});

describe('appendToLog', () => {
  it('keeps three turns by default', () => {
    expect(LOG_TURNS_KEPT).toBe(3);
  });

  it('adds entries to an empty log', () => {
    const log = appendToLog([], [entry(1, 'DD1'), entry(1, 'DD2')]);
    expect(log.map((item) => item.shipId)).toEqual(['DD1', 'DD2']);
  });

  it('keeps only the latest three turns', () => {
    let log: LogEntry[] = [];
    for (let turn = 1; turn <= 5; turn += 1) {
      log = appendToLog(log, [entry(turn, 'DD1'), entry(turn, 'CH1')]);
    }
    expect([...new Set(log.map((item) => item.turn))].sort((a, b) => a - b)).toEqual([3, 4, 5]);
    expect(log).toHaveLength(6);
  });

  it('honours a custom number of turns to keep', () => {
    let log: LogEntry[] = [];
    for (let turn = 1; turn <= 4; turn += 1) {
      log = appendToLog(log, [entry(turn)], 1);
    }
    expect(log).toEqual([entry(4)]);
  });

  it('does not change the log it was given', () => {
    const original = [entry(1), entry(2), entry(3)];
    const copy = structuredClone(original);
    const next = appendToLog(original, [entry(4)]);
    expect(original).toEqual(copy);
    expect(next).not.toBe(original);
    expect(next.map((item) => item.turn)).toEqual([2, 3, 4]);
  });
});
