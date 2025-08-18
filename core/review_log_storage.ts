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
  /** Optional response time in milliseconds (B6). */
  responseTimeMs?: number;
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

/**
 * Transform a text stream (CSV/TSV header + rows) into RevLog objects.
 * Accepts either tab or comma separators; relies on std CsvParseStream for robustness.
 */
export const revLogStream = (): TransformStream<string, RevLog> => {
  const normalizer = new TransformStream<string, string>({
    transform(chunk, controller) {
      controller.enqueue(chunk.replace(/\t/g, ","));
    },
  });
  const csv = new CsvParseStream(); // yields string[] per row
  let header: string[] | null = null;
  let hasResponse = false;
  const mapper = new TransformStream<string[], RevLog>({
    transform(row, controller) {
      if (!header) {
        header = row;
        hasResponse = header.includes("response_time_ms");
        return; // skip header
      }
      if (row.length === 0 || (row.length === 1 && row[0].trim() === "")) {
        return;
      }
      // Row may be shorter (legacy) – pad
      if (hasResponse && row.length === 12) row.push("");
      const [
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
        learning_steps,
        review,
        response_time_ms,
      ] = row;
      controller.enqueue({
        noteId,
        ord: Number(ord),
        rating: Number(rating),
        state: Number(state),
        due: new Date(Number(due)),
        stability: Number(stability),
        difficulty: Number(difficulty),
        elapsed_days: Number(elapsed_days),
        last_elapsed_days: Number(last_elapsed_days),
        scheduled_days: Number(scheduled_days),
        learning_steps: Number(learning_steps),
        review: new Date(Number(review)),
        responseTimeMs: hasResponse
          ? (response_time_ms ? Number(response_time_ms) : undefined)
          : undefined,
      });
    },
  });
  const readable = normalizer.readable.pipeThrough(csv).pipeThrough(mapper);
  return { writable: normalizer.writable, readable };
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
            // use indent + one leading space (matching data row indentation style)
            yield ` ${indent}${header}`;
            hasHeader = true;
          }
          // Remove any existing header-like rows (legacy variants) before emitting logs
          for (let i = block.cells.length - 1; i >= 0; i--) {
            const joined = block.cells[i]?.map?.(raw)?.join?.("\t") ?? "";
            const normalized = joined.replace(/^[\t ]+/, "");
            if (normalized.startsWith("noteId\tord\trating\tstate\tdue")) {
              block.cells.splice(i, 1);
            }
          }
          yield* revLogs.map((log) => ` ${indent}${stringify(log)}`);
          revLogs.splice(0);
        }
        yield* block.cells.map((rows) => {
          const joined = rows.map(raw).join("\t");
          // If legacy row with 12 columns (no response_time_ms), pad an empty column
          const colCount = joined.split("\t").length;
          const needsPad = colCount === 12 && joined.startsWith("note");
          return ` ${indent}${needsPad ? joined + "\t" : joined}`;
        });
        break;
      }
      case "codeBlock": {
        const indent = " ".repeat(block.indent);
        yield `${indent}code:${block.fileName}`;
        yield* block.content.split("\n").map((line) => ` ${indent}${line}`);
        break;
      }
      case "line": {
        const textLine = raw(block.nodes);
        const normalized = textLine.trimStart();
        if (
          normalized.startsWith("noteId\tord\trating\tstate\tdue\tstability")
        ) {
          // Skip legacy stray header line (already re-emitted standardized header)
          break;
        }
        if (normalized.startsWith("noteId\t")) {
          // legacy header already handled above; if we reach here it's some other noteId line, just emit
          yield `${" ".repeat(block.indent)}${textLine}`;
          break;
        }
        // Legacy data row (starts with note id pattern) but missing response_time_ms column
        const parts = normalized.split("\t");
        if (/^\w+\t\d+\t\d+/.test(normalized) && parts.length === 12) {
          yield `${" ".repeat(block.indent)}${textLine}\t`;
          break;
        }
        yield `${" ".repeat(block.indent)}${textLine}`;
        break;
      }
    }
  }

  if (hasUserDataTableBlock && revLogs.length === 0) return;
  yield `table:${tableName}`;
  yield ` ${header}`;
  yield* revLogs.map((log) => ` ${stringify(log)}`);
}

const raw = (nodes: Node[]) => nodes.map((node) => node.raw).join("");

const header =
  "noteId\tord\trating\tstate\tdue\tstability\tdifficulty\telapsed_days\tlast_elapsed_days\tscheduled_days\tlearning_steps\treview\tresponse_time_ms";

const stringify = (revLog: RevLog) => {
  return `${revLog.noteId}\t${revLog.ord}\t${revLog.rating}\t${revLog.state}\t${revLog.due.getTime()}\t${revLog.stability}\t${revLog.difficulty}\t${revLog.elapsed_days}\t${revLog.last_elapsed_days}\t${revLog.scheduled_days}\t${revLog.learning_steps}\t${revLog.review.getTime()}\t${
    revLog.responseTimeMs ?? ""
  }`;
};

const toTableName = (username: string) => `${username}-revlog`;
