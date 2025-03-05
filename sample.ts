import { startReview } from "./main.ts";
import type { Scrapbox } from "@cosense/types/userscript";
import { unwrapErr } from "option-t/plain_result";
declare const scrapbox: Scrapbox;

const result = await startReview(
  scrapbox.Project.name,
  scrapbox.Page.title!,
);
if (result) console.error(unwrapErr(result));
