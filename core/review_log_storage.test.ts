import { assertEquals } from "@std/assert/equals";
import { type RevLog, revLogStream, update } from "./review_log_storage.ts";

Deno.test("update should yield the title block", () => {
  const text = "Sample Title\n";
  const username = "testUser";

  const result = update(text, [], username);
  assertEquals([...result], [
    "Sample Title",
    "",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
  ]);
});

Deno.test("update should yield table blocks with updated review logs", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview
     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t1627849200000
  `;
  const reviewLogs = [{
    noteId: "note1",
    ord: 1,
    rating: 4,
    state: 3,
    due: 1627849200000,
    stability: 0.6,
    difficulty: 0.4,
    elapsed_days: 11,
    last_elapsed_days: 6,
    scheduled_days: 16,
    review: 1627849200000,
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
    "     note1\t1\t4\t3\t1627849200000\t0.6\t0.4\t11\t6\t16\t1627849200000",
    "     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t1627849200000",
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
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
  ]);
});

Deno.test("update should add new review logs if not present in the table", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview
  `;
  const reviewLogs = [{
    noteId: "note2",
    ord: 2,
    rating: 4,
    state: 3,
    due: 1627849200000,
    stability: 0.7,
    difficulty: 0.5,
    elapsed_days: 12,
    last_elapsed_days: 7,
    scheduled_days: 17,
    review: 1627849200000,
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
    "     note2\t2\t4\t3\t1627849200000\t0.7\t0.5\t12\t7\t17\t1627849200000",
    "  ",
  ]);
});

Deno.test("update should handle multiple blocks correctly", () => {
  const text = `Sample Title
    table:testUser-revlog
     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview
     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t1627849200000
    code:example.js
     console.log("Hello, world!");
  `;
  const reviewLogs = [{
    noteId: "note1",
    ord: 1,
    rating: 4,
    state: 3,
    due: 1627849200000,
    stability: 0.6,
    difficulty: 0.4,
    elapsed_days: 11,
    last_elapsed_days: 6,
    scheduled_days: 16,
    review: 1627849200000,
  }] satisfies RevLog[];
  const username = "testUser";

  const result = update(text, reviewLogs, username);

  assertEquals([...result], [
    "Sample Title",
    "    table:testUser-revlog",
    "     noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
    "     note1\t1\t4\t3\t1627849200000\t0.6\t0.4\t11\t6\t16\t1627849200000",
    "     note1\t1\t3\t2\t1627849200000\t0.5\t0.3\t10\t5\t15\t1627849200000",
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
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
  ]);
});

Deno.test("update should handle text with no blocks correctly", () => {
  const text = "Just some random text without any blocks.";
  const username = "testUser";

  const result = update(text, [], username);

  assertEquals([...result], [
    "Just some random text without any blocks.",
    "table:testUser-revlog",
    " noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview",
  ]);
});

Deno.test("extractReviewLogsFromCSV should parse CSV correctly", async () => {
  const result = ReadableStream.from([
    "noteId,ord,rating,state,due,stability,difficulty,elapsed_days,last_elapsed_days,scheduled_days,review\n",
    "note1,1,3,2,1627849200000,0.5,0.3,10,5,15,1627849200000\n",
    "note2,2,4,3,1627849200000,0.7,0.5,12,7,17,1627849200000\n",
  ]).pipeThrough(revLogStream());

  assertEquals(await Array.fromAsync(result), [
    {
      noteId: "note1",
      ord: 1,
      rating: 3,
      state: 2,
      due: 1627849200000,
      stability: 0.5,
      difficulty: 0.3,
      elapsed_days: 10,
      last_elapsed_days: 5,
      scheduled_days: 15,
      review: 1627849200000,
    },
    {
      noteId: "note2",
      ord: 2,
      rating: 4,
      state: 3,
      due: 1627849200000,
      stability: 0.7,
      difficulty: 0.5,
      elapsed_days: 12,
      last_elapsed_days: 7,
      scheduled_days: 17,
      review: 1627849200000,
    },
  ]);
});
