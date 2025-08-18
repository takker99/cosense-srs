import { assert, assertEquals } from "@std/assert";
import { type RevLog, revLogStream, update } from "./review_log_storage.ts";

Deno.test("update should yield the title block", () => {
  const text = "Sample Title\n";
  const username = "testUser";

  const result = update(text, [], username);
  assertEquals([...result], [
    "Sample Title",
    "",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
  ]);
});

Deno.test("update should yield table blocks with updated review logs", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview
     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t0\t1627849200000
  `;
  const reviewLogs = [{
    noteId: "note1",
    ord: 1,
    rating: 4,
    state: 3,
    due: new Date(1627849200000),
    stability: 0.6,
    difficulty: 0.4,
    elapsed_days: 11,
    last_elapsed_days: 6,
    scheduled_days: 16,
    learning_steps: 0,
    review: new Date(1627849200000),
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
    "     note1\t1\t4\t3\t1627849200000\t0.6\t0.4\t11\t6\t16\t0\t1627849200000",
    "     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t0\t1627849200000",
    "  ",
  ]);
});

Deno.test("update should yield code blocks correctly", () => {
  const text = `Sample Title
    code:example.js
     console.log("Hello, world!");
  `;
  const username = "testUser";

  const result = update(text, [], username);

  assertEquals([...result], [
    "Sample Title",
    "    code:example.js",
    '     console.log("Hello, world!");',
    "  ",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
  ]);
});

Deno.test("update should add new review logs if not present in the table", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview
  `;
  const reviewLogs = [{
    noteId: "note2",
    ord: 2,
    rating: 4,
    state: 3,
    due: new Date(1627849200000),
    stability: 0.7,
    difficulty: 0.5,
    elapsed_days: 12,
    last_elapsed_days: 7,
    scheduled_days: 17,
    learning_steps: 0,
    review: new Date(1627849200000),
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
    "     note2\t2\t4\t3\t1627849200000\t0.7\t0.5\t12\t7\t17\t0\t1627849200000",
    "  ",
  ]);
});

Deno.test("update should handle multiple blocks correctly", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview
     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t0\t1627849200000
    code:example.js
     console.log("Hello, world!");
  `;
  const reviewLogs = [{
    noteId: "note1",
    ord: 1,
    rating: 4,
    state: 3,
    due: new Date(1627849200000),
    stability: 0.6,
    difficulty: 0.4,
    elapsed_days: 11,
    last_elapsed_days: 6,
    scheduled_days: 16,
    learning_steps: 0,
    review: new Date(1627849200000),
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
    "     note1\t1\t4\t3\t1627849200000\t0.6\t0.4\t11\t6\t16\t0\t1627849200000",
    "     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t0\t1627849200000",
    "    code:example.js",
    '     console.log("Hello, world!");',
    "  ",
  ]);
});

Deno.test("update should handle empty text correctly", () => {
  const username = "testUser";

  const result = update("", [], username);

  assertEquals([...result], [
    "",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
  ]);
});

Deno.test("update should handle text with no blocks correctly", () => {
  const text = "Just some random text without any blocks.";
  const username = "testUser";

  const result = update(text, [], username);

  assertEquals([...result], [
    "Just some random text without any blocks.",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview",
  ]);
});

Deno.test("extractReviewLogsFromCSV should parse CSV correctly", async () => {
  const result = ReadableStream.from([
    "noteId,ord,rating,state,due,stability,difficulty,elapsed_days,last_elapsed_days,scheduled_days,learning_steps,review\n",
    "note1,1,3,2,1627849200000,0.5,0.3,10,5,15,0,1627849200000\n",
    "note2,2,4,3,1627849200000,0.7,0.5,12,7,17,0,1627849200000\n",
  ]).pipeThrough(revLogStream());

  assertEquals(await Array.fromAsync(result), [
    {
      noteId: "note1",
      ord: 1,
      rating: 3,
      state: 2,
      due: new Date(1627849200000),
      stability: 0.5,
      difficulty: 0.3,
      elapsed_days: 10,
      last_elapsed_days: 5,
      scheduled_days: 15,
      learning_steps: 0,
      review: new Date(1627849200000),
    },
    {
      noteId: "note2",
      ord: 2,
      rating: 4,
      state: 3,
      due: new Date(1627849200000),
      stability: 0.7,
      difficulty: 0.5,
      elapsed_days: 12,
      last_elapsed_days: 7,
      scheduled_days: 17,
      learning_steps: 0,
      review: new Date(1627849200000),
    },
  ]);
});

// --- Merged from review_log_storage_additional.test.ts ---

Deno.test("review_log_storage/update early return when user table present and no new logs", () => {
  const text = `title\n`+
    `table:u-revlog\n noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview\n`+
    ` note1\t1\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0`;
  const lines = [...update(text, [], "u")];
  const userTableOccurrences = lines.filter((l) => l === "table:u-revlog").length;
  assertEquals(userTableOccurrences, 1);
});

Deno.test("review_log_storage/update creates table when absent but others exist", () => {
  const text = `title\n`+
    `table:other\n x\ty`;
  const log: RevLog = {
    noteId: "n",
    ord: 1,
    rating: 3,
    state: 2,
    due: new Date(0),
    stability: 0.1,
    difficulty: 0.2,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    review: new Date(0),
  };
  const lines = [...update(text, [log], "u")];
  assert(lines.includes("table:u-revlog"));
  assert(lines.some((l) => l.includes("n\t1\t3")));
});

Deno.test("review_log_storage/update outputs multiple logs in order", () => {
  const text = `title`;
  const logs: RevLog[] = [
    { noteId: "a", ord: 1, rating: 1, state: 0, due: new Date(0), stability: 0.1, difficulty: 0.2, elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, learning_steps: 0, review: new Date(1) },
    { noteId: "b", ord: 2, rating: 2, state: 1, due: new Date(2), stability: 0.2, difficulty: 0.3, elapsed_days: 1, last_elapsed_days: 0, scheduled_days: 1, learning_steps: 0, review: new Date(3) },
  ];
  const lines = [...update(text, logs, "u")];
  const joined = lines.join("\n");
  const idxA = joined.indexOf("a\t1\t1");
  const idxB = joined.indexOf("b\t2\t2");
  assert(idxA !== -1 && idxB !== -1 && idxA < idxB);
});

Deno.test("revLogStream parses numeric fields and dates including zero", async () => {
  const csv = `noteId,ord,rating,state,due,stability,difficulty,elapsed_days,last_elapsed_days,scheduled_days,learning_steps,review\n`+
    `n,1,0,0,0,0.1,0.2,0,0,0,0,0`;
  const out = await Array.fromAsync(ReadableStream.from([csv]).pipeThrough(revLogStream()));
  assertEquals(out[0].rating, 0);
  assertEquals(out[0].due.getTime(), 0);
});
