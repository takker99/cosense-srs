import { type Decoration, type Node, parse } from "@progfay/scrapbox-parser";
import type { Line as BaseLine } from "./type.ts";
import { noteGUIDRegExp } from "./make_note_guid.ts";

export interface Note {
  /** note ID */
  id: string;

  /**
   * the ID of the lines the node contains
   */
  range: Set<string>;

  created: number;

  /** updated time of the note */
  updated: number;

  /** a list of cloze deletion numbers the content of this note includes */
  clozeDeletions: Set<number>;
}

/**
 * Take `lines` and return parsed notes;
 */
export function* parseNotes(
  lines: BaseLine[],
  clozeDecorationMark: Exclude<Decoration, AsteriskDecorationChar>,
): Generator<Note, void, unknown> {
  if (lines.length === 0) return;
  const blocks = parse(
    lines.map((line) => line.text).join("\n"),
    { hasTitle: true },
  );

  /** 現在読んでいる`pack.rows[0]`の行番号 */
  let counter = 0;
  let processingNote: Note | undefined;
  let noteIndent = 0;

  // # 記法解説
  // ## 穴埋め
  // - 特定の文字装飾と`*`が指定された`[]`内を穴埋めとみなす
  //   - 使用可能な文字装飾は`/[!"#%&'()+,\-./{|}<>_~]/`
  //   - defaultは`!`
  //   - `deco`に使用する文字装飾記法の記号を格納する
  // - 以降、`deco === "!"`と仮定して記述する
  //   - この場合、`[!* foo]`や`[!** foo]`などが穴埋めとみなされる
  //   - `[! foo]`は穴埋めとみなされない
  // - `*`を穴埋めの番号として使う
  //   - 例：`[!* foo] [!** bar] [!*** baz]`
  //   - これらは、AnkiのCloze Deletionの`c1::foo`、`c2::bar`、`c3::baz`に対応する
  // - 同時に穴埋めにしたい場合は、`[!* foo] [!* bar]`のように同じ穴埋め番号にする
  //   - AnkiのCloze Deletionの`c1::foo`、`c1::bar`に対応する
  // - 番号の数だけ`Card`を作る
  //   - `[!* foo] [!** bar]` → 2枚のカードを作る
  //   - `[!* foo] [!** bar] [!*** baz]` → 3枚のカードを作る
  //   - `[!* foo] [!* bar]` → 1枚のカードを作る
  // - 番号が飛ばされている場合は、単に無視する
  //   - 例：`[!* foo] [!*** baz]` → 2枚のカードを作る
  // ## 1つのNoteとみなす範囲
  // - `Line`の場合
  //   - ↑で示した穴埋めがある行と、その行の配下の箇条書きをまとめて1つのNoteとする
  // - `Table`,`CodeBlock`の場合
  //   - 上述したルールですでに何らかのNoteの一部として扱われている場合はそのまま
  //   - そうでない場合は、blockを1つのNoteとみなす
  // - 子の行にGUIDが指定されていたら、その行から別のNoteとして扱う
  // ## Note GUID
  // - 問題文の先頭に`\`guid\``を記述することで、NoteのGUIDを指定できる
  // - 上述したNoteの範囲判定ルールによらず、GUIDが指定された箇条書きの塊を一つのNoteとする
  //   - ただし、箇条書き内に穴埋めが一つもない場合は、警告を出したうえで無視する
  // - GUIDはAnkiと互換性があるように生成される
  // - GUIDが指定されていない場合は、format時に自動生成される
  // - 同じGUIDを指定された箇条書きが複数ある場合は、最後の箇条書きで上書きされる
  //   - ......としたいところだが、現状はどちらも返してしまっている
  //   - Note IDの重複をいかなる場合も許さないようにするか、projectとtitleが違えば重複も許可するかは考え中
  // # formatting
  // - GUIDが省略されている箇所を埋める
  // - `parseNotes`で`Note`の探索と同時に行う

  for (const block of blocks) {
    switch (block.type) {
      case "title":
        counter++;
        break;
      case "line": {
        // reset indent and guid when a shallower indent block is found
        if (block.indent <= noteIndent || block.nodes.length === 0) {
          if (processingNote) yield processingNote;
          processingNote = undefined;
          noteIndent = 0;
        }

        // detect note GUID written in the head of the line
        const head = block.nodes.at(0);
        if (head?.type === "code" && noteGUIDRegExp.test(head.text)) {
          if (processingNote) yield processingNote;
          processingNote = {
            id: head.text,
            range: new Set([lines[counter].id]),
            updated: lines[counter].updated,
            created: lines[counter].created,
            clozeDeletions: new Set(),
          };
          noteIndent = block.indent;
        }
        if (processingNote) {
          processingNote.clozeDeletions = processingNote.clozeDeletions.union(
            detectClozeDeletion(block.nodes, clozeDecorationMark),
          );
          processingNote.range.add(lines[counter].id);
        }
        counter++;
        break;
      }
      case "table": {
        counter += 1 + block.cells.length;
        break;
      }
      case "codeBlock": {
        counter += block.content.split("\n").length + 1;
        break;
      }
    }
  }
  if (processingNote) yield processingNote;
}

export type AsteriskDecorationChar =
  | "*-1"
  | "*-2"
  | "*-3"
  | "*-4"
  | "*-5"
  | "*-6"
  | "*-7"
  | "*-8"
  | "*-9"
  | "*-10";

/**
 * Detects cloze deletions within a list of nodes and returns the cloze deletion numbers
 *
 * @param nodes - An array of nodes to be processed.
 * @param clozeDecorationMark - The decoration used to identify cloze deletions.
 */
const detectClozeDeletion = (
  nodes: Node[],
  clozeDecorationMark: Exclude<Decoration, AsteriskDecorationChar>,
): Set<number> =>
  new Set(nodes.flatMap((node) => {
    if (node.type !== "decoration") return [];
    if (!node.decos.includes(clozeDecorationMark)) return [];
    const astariskDeco = node.decos.find((deco) => deco.startsWith("*-")) as
      | AsteriskDecorationChar
      | undefined;
    if (!astariskDeco) return [];

    return parseInt(astariskDeco.slice(2));
  }));
