import type { ReviewLogInput } from "ts-fsrs";
import type { Path } from "./path.ts";
import { type FetchError, getTable, type TableError } from "@cosense/std/rest";
import { patch } from "@cosense/std/browser/websocket";
import { CsvParseStream } from "@std/csv";
import { createOk, isErr, type Result } from "option-t/plain_result";
import { pipe } from "@core/pipe/async";
import { map } from "@core/iterutil/pipe/async/map";
import { type Node, parse } from "@progfay/scrapbox-parser";

export interface ReviewLogStorageLocation extends Path {
  username: string;
}

export type CardId = `${string}-${number}`;

export const readReviewLog = async (
  init: ReviewLogStorageLocation,
): Promise<
  Result<
    AsyncIterable<[CardId, ReviewLogInput]>,
    TableError | FetchError
  >
> => {
  const res = await fetch(
    getTable.toRequest(init.project, init.title, init.username),
  );
  const stream = res.clone().body?.pipeThrough?.(new TextDecoderStream());
  const result = await getTable.fromResponse(res);
  if (isErr(result)) return result;
  return createOk(await extractReviewLogsFromCSV(stream!));
};

export const extractReviewLogsFromCSV = (
  csv: ReadableStream<string>,
): Promise<AsyncIterable<[CardId, ReviewLogInput]>> => {
  const stream = csv.pipeThrough(
    new CsvParseStream({
      columns: [
        "id",
        "ord",
        "rating",
        "state",
        "due",
        "stability",
        "difficulty",
        "elapsed_days",
        "last_elapsed_days",
        "scheduled_days",
        "review",
      ] as const satisfies ("id" | "ord" | keyof ReviewLogInput)[],
      skipFirstRow: true,
    }),
  );
  return pipe(
    stream[Symbol.asyncIterator](),
    map((
      {
        id,
        ord,
        rating,
        state,
        due,
        stability,
        difficulty,
        elapsed_days,
        last_elapsed_days,
        scheduled_days,
        review,
        ...log
      },
    ): [`${string}-${number}`, ReviewLogInput] => [
      toCardId(id, ord as `${number}`),
      {
        ...log,
        stability: Number(stability),
        difficulty: Number(difficulty),
        elapsed_days: Number(elapsed_days),
        last_elapsed_days: Number(last_elapsed_days),
        scheduled_days: Number(scheduled_days),
        rating: Number(rating),
        state: Number(state),
        due: Number(due),
        review: Number(review),
      },
    ]),
  );
};

export const writeReviewLog = (
  ReviewLogs: ReadonlyMap<CardId, ReviewLogInput>,
  init: ReviewLogStorageLocation,
): ReturnType<typeof patch> =>
  patch(
    init.project,
    init.title,
    (lines) => [
      ...update(
        lines.map((line) => line.text).join("\n"),
        new Map(ReviewLogs),
        init.username,
      ),
    ],
  );

export function* update(
  text: string,
  ReviewLogs: Map<`${string}-${number}`, ReviewLogInput>,
  username: string,
): Generator<string, void, unknown> {
  const blocks = parse(text, { hasTitle: true });
  let hasHeader = false;
  const lastTableBlock = blocks.findLast((block) =>
    block.type === "table" && block.fileName === username
  );
  for (const block of blocks) {
    switch (block.type) {
      case "title":
        yield block.text;
        break;
      case "table": {
        const indent = " ".repeat(block.indent);
        yield `${indent}table:${block.fileName}`;
        if (block.fileName !== username) {
          yield* block.cells.map((rows) =>
            ` ${indent}${rows.map(raw).join("\t")}`
          );
          break;
        }
        const firstRow = block.cells.at(0)?.map?.(raw)?.join?.("\t");
        if (!hasHeader && firstRow !== header) {
          yield ` ${indent}${header}`;
          hasHeader = true;
        } else if (firstRow) {
          yield ` ${indent}${firstRow}`;
        }
        for (const rows of block.cells.slice(1)) {
          const id = toCardId(raw(rows[0]), raw(rows[1]) as `${number}`);
          const log = ReviewLogs.get(id);
          if (!log) {
            yield ` ${indent}${rows.map(raw).join("\t")}`;
            continue;
          }
          yield ` ${indent}${stringify(id, log)}`;
          ReviewLogs.delete(id);
        }
        if (block === lastTableBlock) {
          for (const [id, log] of ReviewLogs) {
            yield ` ${indent}${stringify(id, log)}`;
          }
          ReviewLogs.clear();
        }
        break;
      }
      case "codeBlock": {
        const indent = " ".repeat(block.indent);
        yield `${indent}code:${block.fileName}`;
        yield* block.content.split("\n").map((line) => ` ${indent}${line}`);
        break;
      }
      case "line":
        yield `${" ".repeat(block.indent)}${raw(block.nodes)}`;
        break;
    }
  }

  if (lastTableBlock) return;
  yield `table:${username}`;
  yield ` ${header}`;
  for (const [id, log] of ReviewLogs) {
    yield ` ${stringify(id, log)}`;
  }
  ReviewLogs.clear();
}

const raw = (nodes: Node[]) => nodes.map((node) => node.raw).join("");

const header =
  "id\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview";

const stringify = (id: CardId, log: ReviewLogInput) => {
  const [noteId, ord] = extractCardId(id);
  return `${noteId}\t${ord}\t${log.rating}\t${log.state}\t${log.due}\t${log.stability}\t${log.difficulty}\t${log.elapsed_days}\t${log.last_elapsed_days}\t${log.scheduled_days}\t${log.review}`;
};

const toCardId = (
  noteId: string,
  ord: `${number}` | number,
): CardId => `${noteId}-${ord}`;
const extractCardId = (id: CardId): [string, number] => {
  const noteId = id.slice(0, id.lastIndexOf("-"));
  const ord = parseInt(id.split("-").pop() ?? "0");
  return [noteId, ord];
};
