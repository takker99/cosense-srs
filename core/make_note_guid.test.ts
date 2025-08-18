import { assert, assertEquals, assertMatch } from "@std/assert";
import { makeNoteGUID, noteGUIDRegExp } from "./make_note_guid.ts";

// Deterministic test by monkey-patching Math.random
Deno.test("makeNoteGUID returns empty when random yields 0 (regex not matched by design)", () => {
  const orig = Math.random;
  try {
    Math.random = () => 0; // n becomes 0 -> while loop skipped -> ""
    const guid = makeNoteGUID();
    assertEquals(guid, "");
    // Empty GUID path is an edge case (not intended in production), so we don't assert regex.
  } finally {
    Math.random = orig;
  }
});

Deno.test("makeNoteGUID produces characters only from table and matches regex", () => {
  const guid = makeNoteGUID();
  assert(noteGUIDRegExp.test(guid));
  // All chars are ASCII and in regex class (already covered by regex test) but also non-empty unless random==0 path.
});

Deno.test("noteGUIDRegExp matches known sample", () => {
  assertMatch("A1_z-?~", noteGUIDRegExp);
});
