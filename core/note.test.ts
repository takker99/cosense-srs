import { assertEquals } from "@std/assert/equals";
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
