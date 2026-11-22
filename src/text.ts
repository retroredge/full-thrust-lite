/**
 * Small helpers for the English shown to the players. Pure, with no DOM, so
 * the game and UI layers can both use them.
 */

/** "A", "A and B", or "A, B and C". Empty for no items. */
export function listOf(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The word for `count` things: `one` for exactly one, otherwise `many`
 * (which defaults to `one` with an "s"). For example `plural(2, 'die', 'dice')`
 * is "dice" and `plural(1, 'fire control')` is "fire control".
 */
export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}
