import { assertEquals } from "@std/assert/equals";
import {
  type CardId,
  cardStream,
  type CosenseCard,
  update,
} from "./card_storage.ts";

Deno.test("update should yield the title block", () => {
  const text = "Sample Title\n";
  const username = "testUser";

  const result = update(text, new Map<CardId, CosenseCard>(), username);
  assertEquals([...result], [
    "Sample Title",
    "",
    "table:testUser-card",
    " noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
  ]);
});

Deno.test("update should yield table blocks with updated review logs", () => {
  const text = `Sample Title
    table:testUser-card
     noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review
     note1\t1\t3\t1627849200000\t0.5\t0.3\t10\t5\t0\t0\t0\tundefined
  `;
  const cards = new Map<CardId, CosenseCard>([
    [
      "note1-1",
      {
        state: 3,
        due: new Date(1627849200000),
        stability: 0.6,
        difficulty: 0.4,
        elapsed_days: 11,
        scheduled_days: 16,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        last_review: new Date(1627849200000),
      },
    ],
  ]);
  const username = "testUser";

  const result = update(text, cards, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-card",
    "     noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
    "     note1\t1\t3\t1627849200000\t0.6\t0.4\t11\t16\t0\t1\t0\t1627849200000",
    "  ",
  ]);
});

Deno.test("update should yield code blocks correctly", () => {
  const text = `Sample Title
    code:example.js
     console.log("Hello, world!");
  `;
  const username = "testUser";

  const result = update(text, new Map<CardId, CosenseCard>(), username);

  assertEquals([...result], [
    "Sample Title",
    "    code:example.js",
    '     console.log("Hello, world!");',
    "  ",
    "table:testUser-card",
    " noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
  ]);
});

Deno.test("update should add new review logs if not present in the table", () => {
  const text = `Sample Title
    table:testUser-card
     noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review
  `;
  const cards = new Map<CardId, CosenseCard>([
    [
      "note2-2",
      {
        state: 3,
        due: new Date(1627849200000),
        stability: 0.7,
        difficulty: 0.5,
        elapsed_days: 12,
        scheduled_days: 17,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
      },
    ],
  ]);
  const username = "testUser";

  const result = update(text, cards, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-card",
    "     noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
    "     note2\t2\t3\t1627849200000\t0.7\t0.5\t12\t17\t0\t1\t0\tundefined",
    "  ",
  ]);
});

Deno.test("update should handle multiple blocks correctly", () => {
  const text = `Sample Title
    table:testUser-card
     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t1627849200000
    code:example.js
     console.log("Hello, world!");
  `;
  const reviewLogs = new Map<CardId, CosenseCard>([
    [
      "note1-1",
      {
        state: 3,
        due: new Date(1627849200000),
        stability: 0.6,
        difficulty: 0.4,
        elapsed_days: 11,
        scheduled_days: 16,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        last_review: new Date(1627849200000),
      },
    ],
  ]);
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-card",
    "     noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
    "     note1\t1\t3\t1627849200000\t0.6\t0.4\t11\t16\t0\t1\t0\t1627849200000",
    "    code:example.js",
    '     console.log("Hello, world!");',
    "  ",
  ]);
});

Deno.test("update should handle empty text correctly", () => {
  const text = "";
  const reviewLogs = new Map<CardId, CosenseCard>();
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "",
    "table:testUser-card",
    " noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
  ]);
});

Deno.test("update should handle text with no blocks correctly", () => {
  const text = "Just some random text without any blocks.";
  const reviewLogs = new Map<CardId, CosenseCard>();
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Just some random text without any blocks.",
    "table:testUser-card",
    " noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review",
  ]);
});

Deno.test("cardStream should parse CSV correctly", async () => {
  const result = ReadableStream.from([
    "noteId,ord,state,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,last_review\n",
    "note1,1,3,1627849200000,0.5,0.3,10,5,0,15,2,1627849200000\n",
    "note2,2,2,1627849200000,0.7,0.5,12,7,0,17,5,undefined\n",
  ]).pipeThrough(cardStream());

  assertEquals(await Array.fromAsync(result), [
    ["note1-1", {
      state: 3,
      due: new Date(1627849200000),
      stability: 0.5,
      difficulty: 0.3,
      elapsed_days: 10,
      scheduled_days: 5,
      learning_steps: 0,
      reps: 15,
      lapses: 2,
      last_review: new Date(1627849200000),
    }],
    ["note2-2", {
      state: 2,
      due: new Date(1627849200000),
      stability: 0.7,
      difficulty: 0.5,
      elapsed_days: 12,
      scheduled_days: 7,
      learning_steps: 0,
      reps: 17,
      lapses: 5,
      last_review: undefined,
    }],
  ]);
});
