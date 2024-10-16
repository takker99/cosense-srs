import { assertEquals } from "@std/assert/equals";
import json from "./sample-page1.json" with { type: "json" };
import { parseNotes } from "./note.ts";

Deno.test("parseNotes", () => {
  assertEquals([...parseNotes(json.lines, "!")], [
    // deno-fmt-ignore
    { id: "%Y4u,z/)", clozeDeletions: new Set([1, 2]), created: 1729063438, updated: 1729063674, }, // deno-fmt-ignore
    { id: "[ZRe=axi", clozeDeletions: new Set([1, 2]), created: 1729063682, updated: 1729065965, }, // deno-fmt-ignore
    { id: ";)f\$&p&/", clozeDeletions: new Set(), created: 1729063516, updated: 1729063746, }, // deno-fmt-ignore
    { id: "b,shjX~Uk", clozeDeletions: new Set([1, 2]), created: 1729063572, updated: 1729063746, }, // deno-fmt-ignore
    { id: "s=y#TrE)", clozeDeletions: new Set([1]), created: 1729063738, updated: 1729063805, }, // deno-fmt-ignore
    { id: "F1odiPo{", clozeDeletions: new Set([1, 2]), created: 1676878936, updated: 1729064431, },
  ]);
});
