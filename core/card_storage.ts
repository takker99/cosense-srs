import type { CardInput } from "ts-fsrs";
import type { Path } from "./path.ts";
import { type FetchError, getTable, type TableError } from "@cosense/std/rest";
import { patch } from "@cosense/std/browser/websocket";
import { CsvParseStream } from "@std/csv";
import { createOk, isErr, type Result } from "option-t/plain_result";
import { type Node, parse } from "@progfay/scrapbox-parser";

export interface CosenseCard extends Omit<CardInput, "due"> {
  due: number;
}

export interface CardStorageLocation extends Path {
  username: string;
}

export const readCards = async (
  init: CardStorageLocation,
): Promise<
  Result<
    ReadableStream<[CardId, CosenseCard]>,
    TableError | FetchError
  >
> => {
  const res = await fetch(
    getTable.toRequest(init.project, init.title, toTableName(init.username)),
  );
  const stream = res.clone().body;
  const result = await getTable.fromResponse(res);
  if (isErr(result)) return result;
  if (!stream) throw new Error("This HTTP response has no body.");
  return createOk(
    stream.pipeThrough(new TextDecoderStream()).pipeThrough(cardStream()),
  );
};

/** Transform a stream `string` into a stream {@linkcode CosenseCard}. */
export const cardStream = (
  writableStrategy?: QueuingStrategy<string>,
  readableStrategy?: QueuingStrategy<[CardId, CosenseCard]>,
): TransformStream<string, [CardId, CosenseCard]> => {
  const { readable, writable } = new CsvParseStream({
    columns: [
      "noteId",
      "ord",
      "state",
      "due",
      "stability",
      "difficulty",
      "elapsed_days",
      "scheduled_days",
      "reps",
      "lapses",
      "last_review",
    ] as const satisfies ("noteId" | "ord" | keyof CosenseCard)[],
    skipFirstRow: true,
    writableStrategy,
  });

  const yielded = new Set<CardId>();

  return {
    writable,
    readable: readable.pipeThrough(
      new TransformStream(
        {
          transform(
            {
              noteId,
              ord,
              state,
              due,
              stability,
              difficulty,
              elapsed_days,
              scheduled_days,
              reps,
              lapses,
              last_review,
            },
            controller,
          ) {
            const id = toCardId(noteId, ord as `${number}`);
            if (yielded.has(id)) return;
            yielded.add(id);

            controller.enqueue([id, {
              stability: Number(stability),
              difficulty: Number(difficulty),
              elapsed_days: Number(elapsed_days),
              scheduled_days: Number(scheduled_days),
              reps: Number(reps),
              lapses: Number(lapses),
              state: Number(state),
              due: Number(due),
              last_review: Number(last_review),
            }]);
          },
        },
        undefined,
        readableStrategy,
      ),
    ),
  };
};

export const writeCards = (
  cards: ReadonlyMap<CardId, CosenseCard>,
  init: CardStorageLocation,
): ReturnType<typeof patch> =>
  patch(
    init.project,
    init.title,
    (lines) => [
      ...update(
        lines.map((line) => line.text).join("\n"),
        new Map(cards),
        init.username,
      ),
    ],
  );

export function* update(
  text: string,
  cards: Map<CardId, CosenseCard>,
  username: string,
): Generator<string, void, unknown> {
  const blocks = parse(text, { hasTitle: true });
  let hasHeader = false;
  const tableName = toTableName(username);

  const lastTableBlock = blocks.findLast((block) =>
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
        if (block.fileName !== tableName) {
          yield* block.cells.map((rows) =>
            ` ${indent}${rows.map(raw).join("\t")}`
          );
          break;
        }
        const firstRow = block.cells.at(0)?.map?.(raw)?.join?.("\t");
        if (!hasHeader && firstRow !== header) {
          yield ` ${indent}${header}`;
          hasHeader = true;
        }
        if (firstRow) yield ` ${indent}${firstRow}`;
        for (const rows of block.cells.slice(1)) {
          const id = toCardId(raw(rows[0]), raw(rows[1]) as `${number}`);
          const card = cards.get(id);
          if (!card) {
            yield ` ${indent}${rows.map(raw).join("\t")}`;
            continue;
          }
          yield ` ${indent}${stringify(id, card)}`;
          cards.delete(id);
        }
        if (block === lastTableBlock) {
          for (const [id, card] of cards) {
            yield ` ${indent}${stringify(id, card)}`;
          }
          cards.clear();
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
  yield `table:${tableName}`;
  yield ` ${header}`;
  for (const [id, card] of cards) {
    yield ` ${stringify(id, card)}`;
  }
}

const raw = (nodes: Node[]) => nodes.map((node) => node.raw).join("");

const header =
  "noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\treps\tlapses\tlast_review";

const stringify = (id: CardId, card: CosenseCard) => {
  const [noteId, ord] = extractCardId(id);
  return `${noteId}\t${ord}\t${card.state}\t${card.due}\t${card.stability}\t${card.difficulty}\t${card.elapsed_days}\t${card.scheduled_days}\t${card.reps}\t${card.lapses}\t${card.last_review}`;
};

const toTableName = (username: string) => `${username}-card`;

export type CardId = `${string}-${number}`;

const toCardId = (
  noteId: string,
  ord: `${number}` | number,
): CardId => `${noteId}-${ord}`;
const extractCardId = (id: CardId): [string, number] => {
  const noteId = id.slice(0, id.lastIndexOf("-"));
  const ord = parseInt(id.split("-").pop() ?? "0");
  return [noteId, ord];
};
