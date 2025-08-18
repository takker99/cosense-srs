import { assertEquals } from "@std/assert";
import { extractCardId, toCardId } from "./card.ts";

Deno.test("toCardId constructs id correctly with numeric ord", () => {
  const id = toCardId("noteABC", 3);
  assertEquals(id, "noteABC-3");
});

Deno.test("toCardId constructs id correctly with string ord", () => {
  const id = toCardId("noteABC", "42");
  assertEquals(id, "noteABC-42");
});

Deno.test("extractCardId splits complex id", () => {
  const id = toCardId(";)f$&p&/path-sub", 7);
  assertEquals(extractCardId(id), [";)f$&p&/path-sub", 7]);
});

Deno.test("extractCardId handles multi hyphen note ids", () => {
  const id = toCardId("multi-hyphen-note-id", 10);
  assertEquals(extractCardId(id), ["multi-hyphen-note-id", 10]);
});

Deno.test("extractCardId with trailing hyphen edge (ord=0 fallback)", () => {
  // Although CardId pattern implies a number at end, ensure robustness.
  // We simulate malformed id purposely.
  // @ts-ignore intentional malformed for robustness test
  assertEquals(extractCardId("abc-"), ["abc", 0]);
});

Deno.test("extractCardId with no hyphen keeps full string except last char removed by slice(0,-1)", () => {
  // Implementation uses slice(0, lastIndexOf('-')); lastIndexOf returns -1, slice(0,-1) drops last char.
  // @ts-ignore malformed
  assertEquals(extractCardId("abcdef"), ["abcde", 0]);
});

Deno.test("extractCardId with non-numeric ord fallback 0", () => {
  // @ts-ignore malformed
  assertEquals(extractCardId("note-xyz"), ["note", 0]);
});
