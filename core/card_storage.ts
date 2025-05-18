import type { Path } from "./path.ts";
import { type FetchError, getTable, type TableError } from "@cosense/std/rest";
import { patch } from "@cosense/std/browser/websocket";
import { CsvParseStream } from "@std/csv";
import { createOk, isErr, type Result, unwrapErr } from "option-t/plain_result";
import { type Node, parse } from "@progfay/scrapbox-parser";
import { emptyStream } from "./empty_stream.ts";
import {
  type CardId,
  type CosenseCard,
  extractCardId,
  toCardId,
} from "./card.ts";

export interface CardStorageLocation extends Path {
  /** username
   *
   * card storageのtable nameを作るのに使われる
   */
  username: string;
}

/** card storageからcardsを読み込む
 *
 * @param init card storageへのパス
 */
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
  if (isErr(result)) {
    // When the table is not created yet.
    if (unwrapErr(result).name === "NotFoundError") {
      return createOk(emptyStream());
    }
    return result;
  }
  if (!stream) throw new Error("This HTTP response has no body.");
  return createOk(
    stream.pipeThrough(new TextDecoderStream()).pipeThrough(cardStream()),
  );
};

/** Transform a stream `string` into a stream {@linkcode CosenseCard}.
 *
 * @internal
 *
 * ```ts
 * import { assertEquals } from "@std/assert/equals";
 *
 * const result = ReadableStream.from([
 *   "noteId,ord,state,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,last_review\n",
 *   "note1,1,3,1627849200000,0.5,0.3,10,5,0,15,2,1627849200000\n",
 *   "note2,2,2,1627849200000,0.7,0.5,12,7,0,17,5,undefined\n",
 * ]).pipeThrough(cardStream());

 * assertEquals(await Array.fromAsync(result), [
 *   ["note1-1", {
 *     state: 3,
 *     due: new Date(1627849200000),
 *     stability: 0.5,
 *     difficulty: 0.3,
 *     elapsed_days: 10,
 *     scheduled_days: 5,
 *     learning_steps: 0,
 *     reps: 15,
 *     lapses: 2,
 *     last_review: new Date(1627849200000),
 *   }],
 *   ["note2-2", {
 *     state: 2,
 *     due: new Date(1627849200000),
 *     stability: 0.7,
 *     difficulty: 0.5,
 *     elapsed_days: 12,
 *     scheduled_days: 7,
 *     learning_steps: 0,
 *     reps: 17,
 *     lapses: 5,
 *     last_review: undefined,
 *   }],
 * ]);
 * ```
 *
 */
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
      "learning_steps",
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
              learning_steps,
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
              learning_steps: Number(learning_steps),
              reps: Number(reps),
              lapses: Number(lapses),
              state: Number(state),
              due: new Date(Number(due)),
              last_review: last_review === "undefined"
                ? undefined
                : new Date(Number(last_review)),
            }]);
          },
        },
        undefined,
        readableStrategy,
      ),
    ),
  };
};

/** card storageにcardsを書き込む
 *
 * @param init card storageへのパス
 */
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
        if (!hasHeader) {
          yield ` ${indent}${header}`;
          hasHeader = true;
        }
        const firstRow = block.cells.at(0)?.map?.(raw)?.join?.("\t");
        if (firstRow === header) block.cells.splice(0, 1);
        for (const rows of block.cells) {
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
  "noteId\tord\tstate\tdue\tstability\tdifficulty\telapsed_days\tscheduled_days\tlearning_steps\treps\tlapses\tlast_review";

const stringify = (id: CardId, card: CosenseCard) => {
  const [noteId, ord] = extractCardId(id);
  return `${noteId}\t${ord}\t${card.state}\t${card.due.getTime()}\t${card.stability}\t${card.difficulty}\t${card.elapsed_days}\t${card.scheduled_days}\t${card.learning_steps}\t${card.reps}\t${card.lapses}\t${card.last_review?.getTime?.()}`;
};

const toTableName = (username: string) => `${username}-card`;
