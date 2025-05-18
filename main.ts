import { getPage } from "@cosense/std/rest";
import { editor, getLineDOM } from "@cosense/std/browser/dom";
import { isErr, unwrapOk } from "option-t/plain_result";
import { type Note, parseNotes } from "./core/note.ts";
import {
  type CardId,
  type CosenseCard,
  extractCardId,
  readCards,
  toCardId,
  writeCards,
} from "./core/card_storage.ts";
import { createEmptyCard, FSRS, type Grade, Rating, State } from "ts-fsrs";
import { writeReviewLog } from "./core/review_log_storage.ts";
import { shuffle } from "@std/random/shuffle";
import { flatten } from "@core/iterutil/flatten";
import { map } from "@core/iterutil/map";
import { reduce } from "@core/iterutil/reduce";
import { showFlashCardController } from "./ui/flash_card_panel.tsx";

export const startReview = async (project: string, title: string) => {
  const res = await getPage(project, title);
  if (isErr(res)) return res;
  const lines = unwrapOk(res).lines;
  const notes = new Map<string, Note>(
    map(parseNotes(lines, "!"), (note) => [note.id, note]),
  );
  const targetCardIds = flatten(
    map(
      notes.values(),
      (note) => map(note.clozeDeletions, (ord) => toCardId(note.id, ord)),
    ),
  );

  const cardStorageLocation = {
    project,
    title,
    username: "takker",
  } as const;

  const res2 = await readCards(cardStorageLocation);
  if (isErr(res2)) return res2;
  const cardsInThePage = await loadCard(targetCardIds, unwrapOk(res2));
  const [newCardsCount, learningCardsCount, reviewCardsCount] =
    classifyAndCount(cardsInThePage.values());
  alert(
    `New: ${newCardsCount}, Learning: ${learningCardsCount}, Review: ${reviewCardsCount}`,
  );
  if (newCardsCount + learningCardsCount + reviewCardsCount === 0) return;
  const f = new FSRS({});

  const shuffledCards = shuffle([...cardsInThePage]);
  const style = document.createElement("style");
  editor()!.insertAdjacentElement("afterbegin", style);
  let cardStateInLoop: {
    id: CardId;
    card: CosenseCard;
    noteId: string;
    note: Note;
    ord: number;
  } | undefined;
  try {
    for await (const state of showFlashCardController()) {
      // 正解を表示する
      if (state === "answer") {
        if (!cardStateInLoop) continue;
        style.textContent = makeAnswerModeCSS(cardStateInLoop.note);
        continue;
      }

      // 回答内容をDBに書き込む
      if (cardStateInLoop) {
        const logItem = f.next(
          cardStateInLoop.card,
          new Date(),
          toRating(state),
        );
        // TODO: 単にDBに書き込むだけでなく、cardsInThePageにも反映させる必要がある
        // countsが変わるとともに、cardsのstateも変わる
        // 場合によっては、もう一度回答することになるかもしれない
        const res = await writeCards(
          new Map([[cardStateInLoop.id, logItem.card]]),
          cardStorageLocation,
        );
        if (isErr(res)) throw res;
        const res2 = await writeReviewLog(
          [{
            noteId: cardStateInLoop.noteId,
            ord: cardStateInLoop.ord,
            ...logItem.log,
          }],
          cardStorageLocation,
        );
        if (isErr(res2)) throw res2;
      }

      // 次の問題を用意する
      const [id, card] = shuffledCards.shift() ?? [];
      if (!id || !card) break;
      const [noteId, ord] = extractCardId(id);
      const note = notes.get(noteId)!;
      cardStateInLoop = { id, card, noteId, note, ord };
      style.textContent = makeQuestionModeCSS(note, ord);
      getLineDOM([...note.range][0])?.scrollIntoView?.({ block: "center" });
    }
  } catch (cause) {
    const error = new Error("An error occurred during the review.", { cause });
    alert(`${error}`);
    throw error;
  } finally {
    style.remove();
  }
};

const classifyAndCount = (
  cards: Iterable<CosenseCard>,
): [number, number, number] => {
  let newCardsCount = 0;
  let learningCardsCount = 0;
  let reviewCardsCount = 0;
  for (const card of cards) {
    switch (card.state) {
      case State.New:
        newCardsCount++;
        break;
      case State.Learning:
      case State.Relearning:
        learningCardsCount++;
        break;
      case State.Review:
        reviewCardsCount++;
        break;
    }
  }
  return [newCardsCount, learningCardsCount, reviewCardsCount] as const;
};

/**
 * Load cards from saved cards.
 * If the card is not found in the saved cards, create an empty card.
 * @param cardIds
 * @param savedCards
 * @returns
 */
const loadCard = async (
  cardIds: Iterable<CardId>,
  savedCards:
    | Iterable<[CardId, CosenseCard]>
    | AsyncIterable<[CardId, CosenseCard]>,
): Promise<Map<CardId, CosenseCard>> => {
  const loadedCards = new Map<CardId, CosenseCard>();
  const targetCardIds = new Set(cardIds);
  for await (const [id, card] of savedCards) {
    if (!targetCardIds.has(id)) continue;
    loadedCards.set(id, card);
    targetCardIds.delete(id);
    if (targetCardIds.size === 0) break;
  }
  for (const id of targetCardIds) {
    loadedCards.set(id, createEmptyCard());
  }
  return loadedCards;
};

const makeQuestionModeCSS = (note: Note, ord: number) =>
  `${`.line:not(:is(${
    reduce(
      note.range,
      (joined, lineId) => [joined, `#L${lineId}`].join(","),
      "",
    )
  }))`}>:not(.telomere),.line .level-${ord} .deco-\\! span.char-index{visibility:hidden}`;

const makeAnswerModeCSS = (note: Note) =>
  `.line:not(:is(${
    reduce(
      note.range,
      (joined, lineId) => [joined, `#L${lineId}`].join(","),
      "",
    )
  })) strong .deco-\\! span.char-index{visibility:hidden}`;

const toRating = (state: "easy" | "good" | "hard" | "again"): Grade =>
  state === "easy"
    ? Rating.Easy
    : state === "good"
    ? Rating.Good
    : state === "hard"
    ? Rating.Hard
    : Rating.Again;
