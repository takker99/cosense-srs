import { createEmptyCard, type FSRS, type Grade, Rating, State } from "ts-fsrs";
import { type CardId, type CosenseCard, toCardId } from "./card.ts";
import type { Note } from "./note.ts";

// Core session data structures
export interface CardState {
  id: CardId;
  card: CosenseCard;
  noteId: string;
  note: Note;
  ord: number; // cloze ordinal
  // learning steps support
  learningStepIndex?: number; // 0-based index in configured steps
  dueAt?: number; // epoch ms for next availability (used while in Learning/Relearning short steps)
}

export interface Queues {
  learning: CardState[];
  review: CardState[];
  New: CardState[]; // capital N to mirror State.New naming already used
  // sibling bury support: noteId -> buried sibling CardStates
  buried: Map<string, CardState[]>;
}

export const newQueues = (): Queues => ({
  learning: [],
  review: [],
  New: [],
  buried: new Map(),
});

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

/** Build queues while burying sibling cards of the same note until the first card graduates from learning. */
export const buildQueuesWithSiblingBury = (
  cardStates: Iterable<CardState>,
): Queues => {
  const grouped = new Map<string, CardState[]>();
  for (const cs of cardStates) {
    let arr = grouped.get(cs.noteId);
    if (!arr) grouped.set(cs.noteId, arr = []);
    arr.push(cs);
  }
  const q = newQueues();
  for (const [, list] of grouped) {
    if (list.length === 0) continue;
    // deterministic order: existing order of iteration
    const [head, ...rest] = list;
    enqueue(q, head);
    // Only bury siblings if head is New or currently in (Re)Learning short steps; if already Review, release immediately.
    if (
      head.card.state === State.New || head.card.state === State.Learning ||
      head.card.state === State.Relearning
    ) {
      if (rest.length) q.buried.set(head.noteId, rest);
    } else {
      for (const cs of rest) enqueue(q, cs);
    }
  }
  return q;
};

/**
 * Pick next card honouring availability windows for learning cards.
 * Learning queue: skip cards whose dueAt is in the future (push them back to queue tail).
 */
export const pickNext = (
  queues: Queues,
  now = Date.now(),
): CardState | undefined => {
  // process learning queue with temporal gating
  let rotations = queues.learning.length;
  while (rotations-- > 0) {
    const cs = queues.learning.shift()!;
    if (cs.dueAt && cs.dueAt > now) {
      // not yet due -> rotate to end
      queues.learning.push(cs);
    } else {
      return cs;
    }
  }
  return queues.review.shift() ?? queues.New.shift();
};

/** Release buried siblings if the answered card has graduated to Review (learningStepIndex cleared & state Review). */
export const releaseBuriedIfGraduated = (
  queues: Queues,
  updated: CardState,
) => {
  if (updated.card.state !== State.Review) return;
  // For safety also require no learningStepIndex present
  if (updated.learningStepIndex !== undefined) return;
  const siblings = queues.buried.get(updated.noteId);
  if (!siblings) return;
  queues.buried.delete(updated.noteId);
  for (const cs of siblings) enqueue(queues, cs);
};

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

export interface LearningStepsConfig {
  stepsSeconds: number[]; // e.g. [60,300]
}

export const defaultLearningSteps: LearningStepsConfig = {
  stepsSeconds: [60, 300],
};

export const applyAnswer = (
  f: FSRS,
  cs: CardState,
  grade: Grade,
  now = new Date(),
  cfg: LearningStepsConfig = defaultLearningSteps,
): ApplyAnswerResult => {
  const result = f.next(cs.card, now, grade) as unknown as FsrsNextResultLike;
  let updated: CardState = { ...cs, card: result.card };
  let requeue = false;
  if (
    result.card.state === State.Learning ||
    result.card.state === State.Relearning
  ) {
    // compute next short step
    const currentIndex = cs.learningStepIndex ?? 0;
    const nextIndex = grade === Rating.Again ? currentIndex : currentIndex + 1; // simplistic advancement rule
    const stepDur =
      cfg.stepsSeconds[Math.min(nextIndex, cfg.stepsSeconds.length - 1)];
    updated = {
      ...updated,
      learningStepIndex: nextIndex,
      dueAt: now.getTime() + stepDur * 1000,
    };
    requeue = true;
  } else {
    // clear transient fields when graduating to Review
    if (updated.learningStepIndex !== undefined) {
      delete updated.learningStepIndex;
      delete updated.dueAt;
    }
  }
  return { updated, log: result.log, requeue };
};

export interface SessionSummary {
  answered: number;
  remaining: { New: number; learning: number; review: number };
  accuracy: number;
  lapses: number;
  newIntroduced: number;
}

export interface SessionMetricsMutable {
  answered: number;
  goodOrEasy: number;
  lapses: number;
  newIntroduced: number;
  seen: Set<CardId>;
}

export const newSessionMetrics = (): SessionMetricsMutable => ({
  answered: 0,
  goodOrEasy: 0,
  lapses: 0,
  newIntroduced: 0,
  seen: new Set(),
});

export const updateMetricsAfterAnswer = (
  m: SessionMetricsMutable,
  cs: CardState,
  grade: Grade,
) => {
  m.answered++;
  if (!m.seen.has(cs.id)) {
    m.seen.add(cs.id);
    if (cs.card.state === State.New) m.newIntroduced++;
  }
  if (grade === Rating.Good || grade === Rating.Easy) m.goodOrEasy++;
  if (grade === Rating.Again) m.lapses++;
};

export const computeAccuracy = (m: SessionMetricsMutable): number =>
  m.answered === 0 ? 0 : m.goodOrEasy / m.answered;

export const summarizeSession = (
  answered: number,
  queues: Queues,
  extra: { accuracy: number; lapses: number; newIntroduced: number },
): SessionSummary => ({
  answered,
  remaining: {
    New: queues.New.length,
    learning: queues.learning.length,
    review: queues.review.length,
  },
  accuracy: extra.accuracy,
  lapses: extra.lapses,
  newIntroduced: extra.newIntroduced,
});
