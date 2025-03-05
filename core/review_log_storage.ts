import type { ReviewLog } from "ts-fsrs";
import type { Path } from "./path.ts";
import { type FetchError, getTable, type TableError } from "@cosense/std/rest";
import { patch } from "@cosense/std/browser/websocket";
import { CsvParseStream } from "@std/csv";
import { createOk, isErr, type Result, unwrapErr } from "option-t/plain_result";
import { type Node, parse } from "@progfay/scrapbox-parser";
import { emptyStream } from "./empty_stream.ts";

export interface RevLog extends ReviewLog {
  noteId: string;
  ord: number;
}

export interface ReviewLogStorageLocation extends Path {
  username: string;
}

export const readReviewLog = async (
  init: ReviewLogStorageLocation,
): Promise<
  Result<
    ReadableStream<RevLog>,
    TableError | FetchError
  >
> => {
  const res = await fetch(
    getTable.toRequest(init.project, init.title, toTableName(init.username)),
  );
  const stream = res.clone().body;
  const result = await getTable.fromResponse(res);
  if (isErr(result)) {
    // When the table is not created yet.
    if (unwrapErr(result).name === "NotFoundError") {
      return createOk(emptyStream());
    }
    return result;
  }
  if (!stream) throw new Error("This HTTP response has no body.");
  return createOk(
    stream.pipeThrough(new TextDecoderStream()).pipeThrough(revLogStream()),
  );
};

/** Transform a stream `string` into a stream {@linkcode RevLog}. */
export const revLogStream = (
  writableStrategy?: QueuingStrategy<string>,
  readableStrategy?: QueuingStrategy<RevLog>,
): TransformStream<string, RevLog> => {
  const { readable, writable } = new CsvParseStream({
    columns: [
      "noteId",
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
    ] as const satisfies (keyof RevLog)[],
    skipFirstRow: true,
    writableStrategy,
  });

  return {
    writable,
    readable: readable.pipeThrough(
      new TransformStream(
        {
          transform(
            {
              noteId,
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
            },
            controller,
          ) {
            controller.enqueue({
              noteId,
              ord: Number(ord),
              stability: Number(stability),
              difficulty: Number(difficulty),
              elapsed_days: Number(elapsed_days),
              last_elapsed_days: Number(last_elapsed_days),
              scheduled_days: Number(scheduled_days),
              rating: Number(rating),
              state: Number(state),
              due: new Date(Number(due)),
              review: new Date(Number(review)),
            });
          },
        },
        undefined,
        readableStrategy,
      ),
    ),
  };
};

export const writeReviewLog = (
  revLogs: Iterable<RevLog>,
  init: ReviewLogStorageLocation,
): ReturnType<typeof patch> => {
  const logs = [...revLogs];
  return patch(
    init.project,
    init.title,
    (lines) => [
      ...update(
        lines.map((line) => line.text).join("\n"),
        logs,
        init.username,
      ),
    ],
  );
};

export function* update(
  text: string,
  revLogs: RevLog[],
  username: string,
): Generator<string, void, unknown> {
  const blocks = parse(text, { hasTitle: true });
  let hasHeader = false;
  const tableName = toTableName(username);

  const hasUserDataTableBlock = blocks.some((block) =>
    block.type === "table" && block.fileName === tableName
  );

  for (const block of blocks) {
    switch (block.type) {
      case "title":
        yield block.text;
        break;
      case "table": {
        const indent = " ".repeat(block.indent);
        yield `${indent}table:${block.fileName}`;
        if (block.fileName === tableName) {
          if (!hasHeader) {
            yield ` ${indent}${header}`;
            hasHeader = true;
          }
          const firstRow = block.cells.at(0)?.map?.(raw)?.join?.("\t");
          if (firstRow === header) block.cells.splice(0, 1);
          yield* revLogs.map((log) => ` ${indent}${stringify(log)}`);
          revLogs.splice(0);
        }
        yield* block.cells.map((rows) =>
          ` ${indent}${rows.map(raw).join("\t")}`
        );
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

  if (hasUserDataTableBlock && revLogs.length === 0) return;
  yield `table:${tableName}`;
  yield ` ${header}`;
  yield* revLogs.map((log) => ` ${stringify(log)}`);
}

const raw = (nodes: Node[]) => nodes.map((node) => node.raw).join("");

const header =
  "noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\treview";

const stringify = (revLog: RevLog) => {
  return `${revLog.noteId}\t${revLog.ord}\t${revLog.rating}\t${revLog.state}\t${revLog.due.getTime()}\t${revLog.stability}\t${revLog.difficulty}\t${revLog.elapsed_days}\t${revLog.last_elapsed_days}\t${revLog.scheduled_days}\t${revLog.review.getTime()}`;
};

const toTableName = (username: string) => `${username}-revlog`;
