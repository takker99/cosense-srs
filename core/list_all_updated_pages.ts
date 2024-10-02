import { type BaseOptions, listPages, ListPagesOption } from "@cosense/std/rest";
import type { BasePage } from "@cosense/types/rest";
import { isErr, unwrapOk } from "option-t/plain_result";

/**
 * Retrieves all updated pages one by one for `project` since `lastChecked`.
 *
 * @example List all pages in a project
 * ```ts ignore
 * import { listAllUpdatedPages } from "./mod.ts";
 *
 * for await (const page of listAllUpdatedPages("takker")) {
 *   console.log(`${page.title}: ${page.descriptions.join(" ").slice(0, 50)}...`);
 * }
 * ```
 *
 * @param project - The name of the project to retrieve updated pages from.
 * @param lastChecked - The last time checking for updated pages (UNIX timestamp).
 * @param options - Options for `/api/pages/{project}`
 * @returns An async iterable of updated pages.
 */
export async function* listAllUpdatedPages(
  project: string,
  lastChecked: number,
  options?: Omit<ListPagesOption, "sort" | "skip">,
): AsyncGenerator<BasePage, void, unknown> {
  let skip = 0;
  const limit = options?.limit ?? 100;
  while (true) {
    const result = await listPages(project, {
      ...options,
      limit,
      sort: "updated",
      skip,
    });
    if (isErr(result)) return;
    const pages = unwrapOk(result).pages;
    for (const page of pages) {
      if (page.updated <= lastChecked) continue;
      yield page;
    }
    const lastPage = pages.at(-1);
    if (lastPage?.pin === 0 && (lastPage?.updated ?? 0) <= lastChecked) return;
    skip += limit;
  }
}
