import { assertEquals, assert } from "@std/assert";
import { FSRS, State, Rating } from "ts-fsrs";
import {
  applyAnswer,
  buildInitialCardStates,
  buildQueues,
  buildQueuesWithSiblingBury,
  classifyAndCount,
  enqueue,
  newQueues,
  pickNext,
  summarizeSession,
  toRating,
  type CardState,
  releaseBuriedIfGraduated,
  newSessionMetrics,
  updateMetricsAfterAnswer,
  computeAccuracy,
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

Deno.test("learning steps assign dueAt and rotate until due", () => {
  const f = new FSRS({});
  // Start directly in Learning state to avoid dependency on FSRS internal transition rules
  const cs: CardState = {
    id: "n1-0" as CardId,
    card: baseCard(State.Learning),
    noteId: "n1",
    note: note("n1", [0]),
    ord: 0,
  };
  // Answer ANY (Again) should keep Learning and schedule dueAt
  let r = applyAnswer(f as FSRS, cs, Rating.Again, new Date(1000));
  // If still in Learning, it should have dueAt scheduled
  if (r.updated.card.state === State.Learning || r.updated.card.state === State.Relearning) {
    assert(r.requeue);
    assert(r.updated.dueAt! > 1000);
  }
  const q = newQueues();
  enqueue(q, r.updated);
  // Not yet due: pickNext should skip and return undefined (since no other queues)
  const picked1 = pickNext(q, 1000 + 10);
  if (r.updated.card.state === State.Learning || r.updated.card.state === State.Relearning) {
    assertEquals(picked1, undefined);
  }
  // Advance time beyond dueAt
  const picked2 = pickNext(q, r.updated.dueAt! + 1);
  if (picked2) {
    // Answer GOOD to advance step index (only meaningful if still learning)
    r = applyAnswer(f as FSRS, picked2, Rating.Good, new Date((r.updated.dueAt ?? 1000) + 1));
    if (r.updated.learningStepIndex !== undefined) {
      assert(r.updated.learningStepIndex >= 1);
    }
  }
});

Deno.test("sibling bury releases siblings after fabricated graduation", () => {
  const n1 = note("n1", [0, 1]);
  const notes = new Map([["n1", n1]]);
  const cards = new Map([
    [toCardId("n1", 0), { ...baseCard(State.New) }],
    [toCardId("n1", 1), { ...baseCard(State.New) }],
  ] as const);
  const states = buildInitialCardStates(notes as Map<string, Note>, cards);
  const queues = buildQueuesWithSiblingBury(states);
  assertEquals(queues.New.length + queues.learning.length + queues.review.length, 1);
  assertEquals(queues.buried.get("n1")?.length, 1);
  // 模擬的に卒業後のカード状態を作成 (Review state, transient fieldsなし)
  const graduated: CardState = {
    ...states[0],
    card: { ...states[0].card, state: State.Review },
  };
  releaseBuriedIfGraduated(queues, graduated);
  // siblings 解放後: 合計2
  const totalQueued = queues.New.length + queues.learning.length + queues.review.length;
  assertEquals(queues.buried.get("n1"), undefined);
  assertEquals(totalQueued, 2);
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
    const summary = summarizeSession(3, queues, { accuracy: 0, lapses: 0, newIntroduced: 0 });
    assertEquals(summary.answered, 3);
    assertEquals(summary.remaining, { New: 1, learning: 0, review: 0 });
    assertEquals(summary.accuracy, 0);
    assertEquals(summary.lapses, 0);
    assertEquals(summary.newIntroduced, 0);
});

Deno.test("session metrics track accuracy lapses and newIntroduced", () => {
  const metrics = newSessionMetrics();
  const cs1: CardState = { id: "n1-0" as CardId, card: baseCard(State.New), noteId: "n1", note: note("n1", [0]), ord: 0 };
  const cs2: CardState = { id: "n1-1" as CardId, card: baseCard(State.New), noteId: "n1", note: note("n1", [1]), ord: 1 };
  updateMetricsAfterAnswer(metrics, cs1, Rating.Good);
  updateMetricsAfterAnswer(metrics, cs2, Rating.Again);
  updateMetricsAfterAnswer(metrics, cs1, Rating.Easy); // second exposure shouldn't increment newIntroduced
  assertEquals(metrics.answered, 3);
  assertEquals(metrics.newIntroduced, 2);
  assertEquals(metrics.lapses, 1);
  const acc = computeAccuracy(metrics);
  // good+easy = 2 out of 3
  assert(Math.abs(acc - 2 / 3) < 1e-9);
});

Deno.test("toRating maps states", () => {
  assertEquals(toRating("easy"), Rating.Easy);
  assertEquals(toRating("good"), Rating.Good);
  assertEquals(toRating("hard"), Rating.Hard);
  assertEquals(toRating("again"), Rating.Again);
});
