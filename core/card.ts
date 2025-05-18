import type { Card } from "ts-fsrs";

/** Represents a card object in `cosense-srs`
 *
 * It doesn't include {@linkcode CardId}
 */
export interface CosenseCard extends Card {}

export type CardId = `${string}-${number}`;

export const toCardId = (
  noteId: string,
  ord: `${number}` | number,
): CardId => `${noteId}-${ord}`;

/**
 * Break down `id` into a note ID and a card ordinal number.
 * @param id A card ID
 * @returns A tuple of a note ID and a card ordinal number
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert/equals";
 *
 * assertEquals(extractCardId(";)f$&p&/-1"), [";)f$&p&/", 1]);
 * ```
 */
export const extractCardId = (id: CardId): [noteId: string, ord: number] => {
  const noteId = id.slice(0, id.lastIndexOf("-"));
  const ord = parseInt(id.split("-").pop() ?? "0");
  return [noteId, ord];
};
