export interface LogEntry {
  turn: number;
  shipId: string;
  shipName: string;
  playerId: string;
  /** The order in the rules' notation, e.g. "+2, P2". */
  order: string;
  velocity: number;
  course: number;
}

export const LOG_TURNS_KEPT = 3;

/** Adds a turn's entries and drops everything older than the most recent `keep` turns. */
export function appendToLog(log: readonly LogEntry[], entries: readonly LogEntry[], keep = LOG_TURNS_KEPT): LogEntry[] {
  const combined = [...log, ...entries];
  const turns = [...new Set(combined.map((entry) => entry.turn))].sort((a, b) => b - a).slice(0, keep);
  return combined.filter((entry) => turns.includes(entry.turn));
}
