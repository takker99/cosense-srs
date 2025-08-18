import { assertEquals } from "@std/assert";
import { emptyStream } from "./empty_stream.ts";

Deno.test("emptyStream yields no values and closes", async () => {
  const rs = emptyStream();
  const items = await Array.fromAsync(rs);
  assertEquals(items.length, 0);
});
