import { createEmptyCard, type FSRS, type Grade, Rating, State } from "ts-fsrs";
import { toCardId, type CardId, type CosenseCard } from "./card.ts";
import type { Note } from "./note.ts";

// Core session data structures
export interface CardState {
  id: CardId;
  card: CosenseCard;
  noteId: string;
  note: Note;
  ord: number; // cloze ordinal
}

export interface Queues {
  learning: CardState[];
  review: CardState[];
  New: CardState[]; // capital N to mirror State.New naming already used
}

export const newQueues = (): Queues => ({ learning: [], review: [], New: [] });

export const enqueue = (queues: Queues, cs: CardState) => {
  switch (cs.card.state) {
    case State.New:
      queues.New.push(cs);
      break;
    case State.Learning:
    case State.Relearning:
      queues.learning.push(cs);
      break;
    case State.Review:
      queues.review.push(cs);
      break;
  }
};

export const buildQueues = (cardStates: Iterable<CardState>): Queues => {
  const q = newQueues();
  for (const cs of cardStates) enqueue(q, cs);
  return q;
};

export const pickNext = (queues: Queues): CardState | undefined =>
  queues.learning.shift() ?? queues.review.shift() ?? queues.New.shift();

export const classifyAndCount = (
  cards: Iterable<CosenseCard>,
): [number, number, number] => {
  let newCardsCount = 0;
  let learningCardsCount = 0;
  let reviewCardsCount = 0;
  for (const card of cards) {
    switch (card.state) {
      case State.New:
        newCardsCount++;
        break;
      case State.Learning:
      case State.Relearning:
        learningCardsCount++;
        break;
      case State.Review:
        reviewCardsCount++;
        break;
    }
  }
  return [newCardsCount, learningCardsCount, reviewCardsCount] as const;
};

export const toRating = (state: "easy" | "good" | "hard" | "again"): Grade =>
  state === "easy"
    ? Rating.Easy
    : state === "good"
    ? Rating.Good
    : state === "hard"
    ? Rating.Hard
    : Rating.Again;

/**
 * Load cards from persisted storage map/iterable, creating empty cards for missing IDs.
 */
export const loadCardsForPage = async (
  cardIds: Iterable<CardId>,
  savedCards:
    | Iterable<[CardId, CosenseCard]>
    | AsyncIterable<[CardId, CosenseCard]>,
): Promise<Map<CardId, CosenseCard>> => {
  const loadedCards = new Map<CardId, CosenseCard>();
  const targetCardIds = new Set(cardIds);
  for await (const [id, card] of savedCards) {
    if (!targetCardIds.has(id)) continue;
    loadedCards.set(id, card);
    targetCardIds.delete(id);
    if (targetCardIds.size === 0) break;
  }
  for (const id of targetCardIds) {
    loadedCards.set(id, createEmptyCard());
  }
  return loadedCards;
};

/** Convert parsed notes & their cloze ordinals into CardState objects */
export const buildInitialCardStates = (
  notes: Map<string, Note>,
  cards: Map<CardId, CosenseCard>,
): CardState[] => {
  const out: CardState[] = [];
  for (const [noteId, note] of notes) {
    for (const ord of note.clozeDeletions) {
      const id = toCardId(noteId, ord);
      const card = cards.get(id);
      if (!card) continue; // should not happen; loadCardsForPage guarantees presence
      out.push({ id, card, noteId, note, ord });
    }
  }
  return out;
};

// Minimal subset of FSRS next() return value we rely on
interface FsrsNextResultLike {
  card: CosenseCard;
  log: Record<string, unknown> & { state: number };
}

export interface ApplyAnswerResult {
  updated: CardState;
  log: FsrsNextResultLike["log"]; // structure from fsrs (opaque to callers)
  requeue: boolean; // whether to reinsert into a queue for immediate future review
}

export const applyAnswer = (
  f: FSRS,
  cs: CardState,
  grade: Grade,
  now = new Date(),
): ApplyAnswerResult => {
  const result = f.next(cs.card, now, grade) as unknown as FsrsNextResultLike;
  const updated: CardState = { ...cs, card: result.card };
  const state = result.card.state;
  const requeue = state === State.Learning || state === State.Relearning;
  return { updated, log: result.log, requeue };
};

export interface SessionSummary {
  answered: number;
  remaining: { New: number; learning: number; review: number };
}

export const summarizeSession = (
  answered: number,
  queues: Queues,
): SessionSummary => ({
  answered,
  remaining: {
    New: queues.New.length,
    learning: queues.learning.length,
    review: queues.review.length,
  },
});
