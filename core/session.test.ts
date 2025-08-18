import { assertEquals, assert } from "@std/assert";
import { FSRS, State, Rating } from "ts-fsrs";
import {
  applyAnswer,
  buildInitialCardStates,
  buildQueues,
  classifyAndCount,
  enqueue,
  newQueues,
  pickNext,
  summarizeSession,
  toRating,
  type CardState,
} from "./session.ts";
import { toCardId, type CardId, type CosenseCard } from "./card.ts";
import type { Note } from "./note.ts";

// Helper to create a minimal Note
const note = (id: string, ords: number[]): Note => ({
  id,
  clozeDeletions: new Set<number>(ords),
  range: new Set<string>(["1"]),
  created: Date.now(),
  updated: Date.now(),
});

const baseCard = (state: number): CosenseCard => ({
  state,
  due: new Date(),
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
});

Deno.test("buildInitialCardStates + buildQueues distributes by state", () => {
  const n1 = note("n1", [0, 1]);
  const notes = new Map([["n1", n1]]);
  const cards = new Map([
    [toCardId("n1", 0), { ...baseCard(State.New) }],
    [toCardId("n1", 1), { ...baseCard(State.Review) }],
  ] as const);
  const states = buildInitialCardStates(notes as Map<string, Note>, cards);
  const queues = buildQueues(states);
  assertEquals(queues.New.length, 1);
  assertEquals(queues.review.length, 1);
  assertEquals(queues.learning.length, 0);
});

Deno.test("pickNext prioritizes learning > review > new", () => {
  const queues = newQueues();
  const mk = (id: string, s: number): CardState => ({
    id: id as CardId,
    card: baseCard(s),
    noteId: "n",
    note: note("n", [0]),
    ord: 0,
  });
  enqueue(queues, mk("a", State.New));
  enqueue(queues, mk("b", State.Review));
  enqueue(queues, mk("c", State.Learning));
  assertEquals(pickNext(queues)?.id, "c");
  assertEquals(pickNext(queues)?.id, "b");
  assertEquals(pickNext(queues)?.id, "a");
});

Deno.test("applyAnswer returns requeue for learning states", () => {
  const f = new FSRS({});
  const cs: CardState = {
    id: "n1-0" as CardId,
    card: baseCard(State.New),
    noteId: "n1",
    note: note("n1", [0]),
    ord: 0,
  };
  const result = applyAnswer(f as FSRS, cs, Rating.Again);
  assert(result.requeue, "Should requeue after Again leading to Learning state");
});

Deno.test("classifyAndCount tallies states", () => {
  const counts = classifyAndCount([
    baseCard(State.New),
    baseCard(State.Learning),
    baseCard(State.Review),
  ]);
  assertEquals(counts, [1, 1, 1]);
});

Deno.test("summarizeSession returns remaining counts", () => {
  const queues = newQueues();
  const cs: CardState = {
    id: "n1-0" as CardId,
    card: baseCard(State.New),
    noteId: "n1",
    note: note("n1", [0]),
    ord: 0,
  };
  enqueue(queues, cs);
  const summary = summarizeSession(3, queues);
  assertEquals(summary, { answered: 3, remaining: { New: 1, learning: 0, review: 0 } });
});

Deno.test("toRating maps states", () => {
  assertEquals(toRating("easy"), Rating.Easy);
  assertEquals(toRating("good"), Rating.Good);
  assertEquals(toRating("hard"), Rating.Hard);
  assertEquals(toRating("again"), Rating.Again);
});
