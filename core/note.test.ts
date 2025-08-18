import { assertEquals } from "@std/assert";
import json from "./sample-page1.json" with { type: "json" };
import { parseNotes } from "./note.ts";

Deno.test("parseNotes", () => {
  assertEquals([...parseNotes(json.lines, "!")], [
    {
      id: "%Y4u,z/)",
      clozeDeletions: new Set([1, 2]),
      range: new Set(["670f6a0c1280f000008a1fb0"]),
      created: 1729063438,
      updated: 1729063674,
    },
    {
      id: "[ZRe=axi",
      clozeDeletions: new Set([1, 2]),
      range: new Set(["670f6b001280f000008a1fbb"]),
      created: 1729063682,
      updated: 1729065965,
    },
    {
      id: ";)f\$&p&/",
      clozeDeletions: new Set([1, 2]),
      range: new Set([
        "670f6a5b1280f000008a1fb3",
        "670f6a581280f000008a1fb1",
        "670f6a581280f000008a1fb2",
      ]),
      created: 1729063516,
      updated: 1729063746,
    },
    {
      id: "b,shjX~Uk",
      clozeDeletions: new Set([1, 2]),
      range: new Set(["670f6a921280f000008a1fb6"]),
      created: 1729063572,
      updated: 1729063746,
    },
    {
      id: "s=y#TrE)",
      clozeDeletions: new Set([1]),
      range: new Set(["670f6b391280f000008a1fbc"]),
      created: 1729063738,
      updated: 1729063805,
    },
    {
      id: "F1odiPo{",
      clozeDeletions: new Set([1, 2]),
      range: new Set(["63f324571280f00000b361fa"]),
      created: 1676878936,
      updated: 1729064431,
    },
  ]);
});

// --- Merged from note_additional.test.ts ---
import type { Line } from "./type.ts";
const makeLine = (text: string, id: string, created = 0, updated = 0): Line => ({
  text,
  id,
  created,
  updated,
});

Deno.test("parseNotes returns empty on no lines", () => {
  assertEquals([...parseNotes([], "!")], []);
});

Deno.test("parseNotes single GUID line yields one note", () => {
  const lines: Line[] = [
    makeLine("Title", "t"),
    makeLine("`GUID1` text", "l1", 1, 2),
  ];
  const notes = [...parseNotes(lines, "!")];
  assertEquals(notes.length, 1);
  assertEquals(notes[0].id, "GUID1");
});

Deno.test("parseNotes GUID mid sequence flush previous", () => {
  const lines: Line[] = [
    makeLine("Title", "t"),
    makeLine("`G1` a", "a", 1, 1),
    makeLine("  child bullet", "b", 1, 1),
    makeLine("`G2` c", "c", 2, 2),
  ];
  const notes = [...parseNotes(lines, "!")];
  assertEquals(notes.map((n) => n.id), ["G1", "G2"]);
});

Deno.test("parseNotes indentation shallower closes note", () => {
  const lines: Line[] = [
    makeLine("Title", "t"),
    makeLine("`G1` a", "a"),
    makeLine("  child", "b"),
    makeLine("top resets", "c"),
  ];
  const notes = [...parseNotes(lines, "!")];
  assertEquals(notes.length, 1);
});

Deno.test("parseNotes ignores lines without GUID", () => {
  const lines: Line[] = [
    makeLine("Title", "t"),
    makeLine("no guid here", "a"),
    makeLine("still none", "b"),
  ];
  const notes = [...parseNotes(lines, "!")];
  assertEquals(notes.length, 0);
});
