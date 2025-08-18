import { assertEquals } from "@std/assert";
import {
  defaultBufferConfig,
  PersistenceBuffer,
} from "./persistence_buffer.ts";

const stubCard = {
  state: 0,
  due: new Date(),
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
};

Deno.test("PersistenceBuffer flushes by size thresholds", async () => {
  const cardBatches: number[] = [];
  const logBatches: number[] = [];
  const buf = new PersistenceBuffer({
    writeCards: (batch) => {
      cardBatches.push(batch.size);
      return Promise.resolve();
    },
    writeLogs: (logs) => {
      logBatches.push(logs.length);
      return Promise.resolve();
    },
  }, { ...defaultBufferConfig, maxCards: 2, maxLogs: 2, maxAgeMs: 10000 });
  buf.addCard("n1-0" as `${string}-${number}`, stubCard);
  buf.addCard("n1-1" as `${string}-${number}`, stubCard); // triggers size flush on maybeFlush
  await buf.maybeFlush();
  // Robust: ensure at least one flush with size 2 occurred
  const has2 = cardBatches.includes(2);
  assertEquals(has2, true);
  buf.addLog({
    noteId: "n",
    ord: 0,
    rating: 1,
    state: 0,
    due: new Date(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    review: new Date(),
  });
  buf.addLog({
    noteId: "n",
    ord: 1,
    rating: 1,
    state: 0,
    due: new Date(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    review: new Date(),
  });
  await buf.maybeFlush();
  assertEquals(logBatches, [2]);
});

Deno.test("PersistenceBuffer flushes by time", async () => {
  let flushed = 0;
  const buf = new PersistenceBuffer({
    writeCards: () => {
      flushed++;
      return Promise.resolve();
    },
    writeLogs: () => Promise.resolve(),
  }, { maxCards: 10, maxLogs: 10, maxAgeMs: 1 });
  buf.addCard("n1-0" as `${string}-${number}`, stubCard);
  // force time passage by overriding lastFlush
  await new Promise((r) => setTimeout(r, 2));
  await buf.maybeFlush();
  assertEquals(flushed, 1);
});
