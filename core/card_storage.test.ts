import { assert, assertEquals } from "@std/assert";
import { cardStream, update } from "./card_storage.ts";
import type { CardId, CosenseCard } from "./card.ts";

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

// --- Merged from card_storage_additional.test.ts ---

Deno.test("card_storage/update removes existing header row before processing", () => {
  const text = `title\n` +
    `table:user-card\n noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review\n` +
    ` note1\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0\tundefined`;
  const card = {
    state: 0,
    due: new Date(0),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const gen = update(text, new Map([["note1-1", card]]), "user");
  const lines = [...gen];
  const headerCount =
    lines.filter((l) => l.includes("noteId\tord\tstate")).length;
  assertEquals(headerCount, 1);
});

Deno.test("card_storage/update appends even if user table not last overall (design: last user table)", () => {
  const text = `title\n` +
    `table:user-card\n noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review\n` +
    ` note1\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0\tundefined\n` +
    `table:other\n a\tb`;
  const card = {
    state: 0,
    due: new Date(0),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const lines = [...update(text, new Map([["x-2", card]]), "user")];
  assert(lines.some((l) => /x\t2/.test(l)));
});

Deno.test("card_storage/update no existing user table but other tables present -> creates new table", () => {
  const text = `title\n` +
    `table:foo\n x\ty`;
  const card = {
    state: 0,
    due: new Date(0),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const lines = [...update(text, new Map([["n-1", card]]), "user")];
  assert(lines.includes("table:user-card"));
  assert(lines.some((l) => /n\t1/.test(l)));
});

Deno.test("card_storage/update multiple remaining cards appended order preserved", () => {
  const text = `title\n` +
    `table:user-card`;
  const c1 = {
    state: 0,
    due: new Date(0),
    stability: 0.1,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const c2 = {
    state: 0,
    due: new Date(0),
    stability: 0.2,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const map = new Map<`${string}-${number}`, typeof c1 | typeof c2>([
    ["a-1", c1],
    ["b-2", c2],
  ]);
  const lines = [...update(text, map, "user")];
  const aIdx = lines.findIndex((l) => /a\t1\t/.test(l));
  const bIdx = lines.findIndex((l) => /b\t2\t/.test(l));
  assert(aIdx !== -1 && bIdx !== -1 && aIdx < bIdx);
});

// --- Merged from card_storage_extra.test.ts ---

Deno.test("cardStream skips duplicate ids (only first emitted)", async () => {
  const dupCsv =
    `noteId,ord,state,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,last_review\n` +
    `n1,1,0,0,0,0,0,0,0,0,0,undefined\n` +
    `n1,1,3,1,1,1,1,1,1,1,1,1`;
  const out = await Array.fromAsync(
    ReadableStream.from([dupCsv]).pipeThrough(cardStream()),
  );
  assertEquals(out.length, 1);
});

Deno.test("update appends new cards when last table block", () => {
  const text = `title\n` +
    `table:takker-card\n noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review`;
  const card = {
    state: 0,
    due: new Date(0),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const gen = update(
    text,
    new Map<`${string}-${number}`, typeof card>([["a-1", card]]),
    "takker",
  );
  const lines = [...gen];
  const appended = lines.find((l) => l.includes("a\t1"));
  if (!appended) throw new Error("Card line not appended");
});

Deno.test("update preserves unrelated tables and inserts header once", () => {
  const text = `title\n` +
    `table:other\n noteId\tord\tfoo\n x\t1\tbar\n` +
    `table:takker-card\n noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review\n` +
    ` y\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0\tundefined`;
  const card = {
    state: 0,
    due: new Date(0),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
  };
  const gen = update(
    text,
    new Map<`${string}-${number}`, typeof card>([["z-2", card]]),
    "takker",
  );
  const lines = [...gen];
  const headerCount =
    lines.filter((l) => l.includes("noteId\tord\tstate")).length;
  assertEquals(headerCount, 1);
});
