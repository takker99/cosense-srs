import { getPage } from "@cosense/std/rest";
import { editor, getLineDOM } from "@cosense/std/browser/dom";
import { isErr, unwrapOk } from "option-t/plain_result";
import { type Note, parseNotes } from "./core/note.ts";
import { readCards, writeCards } from "./core/card_storage.ts";
import { FSRS } from "ts-fsrs";
import { writeReviewLog } from "./core/review_log_storage.ts";
import { shuffle } from "@std/random/shuffle";
import { flatten } from "@core/iterutil/flatten";
import { map } from "@core/iterutil/map";
import { reduce } from "@core/iterutil/reduce";
import { showFlashCardController } from "./ui/flash_card_panel.tsx";
import type { CardId } from "./core/card.ts";
import {
  applyAnswer,
  buildInitialCardStates,
  buildQueuesWithSiblingBury,
  classifyAndCount,
  loadCardsForPage,
  pickNext,
  summarizeSession,
  toRating,
  type CardState,
  type Queues,
  enqueue,
  releaseBuriedIfGraduated,
  newSessionMetrics,
  updateMetricsAfterAnswer,
  computeAccuracy,
} from "./core/session.ts";
import { PersistenceBuffer, defaultBufferConfig } from "./core/persistence_buffer.ts";
import { showErrorToast, showInfoToast } from "./ui/toast.ts";

// --- Phase A support types ---
const createHUD = () => {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.top = "8px";
  el.style.right = "12px";
  el.style.zIndex = "302";
  el.style.font = "12px/1.4 ui-monospace,monospace";
  el.style.background = "#111a";
  el.style.padding = "4px 8px";
  el.style.borderRadius = "4px";
  document.body.appendChild(el);
  return {
    update(q: Queues, answered: number) {
      el.textContent =
        `New:${q.New.length} Lrn:${q.learning.length} Rev:${q.review.length} Ans:${answered}`;
    },
    remove() {
      el.remove();
    },
  };
};

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
      (note) => map(note.clozeDeletions, (ord) => ({ noteId: note.id, ord })),
    ),
  );

  const cardStorageLocation = {
    project,
    title,
    username: "takker",
  } as const;

  const res2 = await readCards(cardStorageLocation);
  if (isErr(res2)) return res2;
  const cardIdsIterable = map(targetCardIds, (p) => `${p.noteId}-${p.ord}` as CardId);
  const cardsInThePage = await loadCardsForPage(cardIdsIterable, unwrapOk(res2));
  const [newCardsCount, learningCardsCount, reviewCardsCount] =
    classifyAndCount(cardsInThePage.values());
  if (newCardsCount + learningCardsCount + reviewCardsCount === 0) {
    showInfoToast("No cards to review.");
    return;
  }
  const f = new FSRS({});

  // Build initial queues
  const initial = shuffle(buildInitialCardStates(notes, cardsInThePage));
  const queues = buildQueuesWithSiblingBury(initial);
  let answered = 0; // retained for backwards compatibility
  const metrics = newSessionMetrics();
  const hud = createHUD();
  hud.update(queues, answered);

  const style = document.createElement("style");
  editor()!.insertAdjacentElement("afterbegin", style);
  let cardStateInLoop: CardState | undefined;
  const buffer = new PersistenceBuffer({
    writeCards: async (batch) => {
      const res = await writeCards(batch, cardStorageLocation);
      if (isErr(res)) throw res;
    },
    writeLogs: async (logs) => {
      const res = await writeReviewLog(logs, cardStorageLocation);
      if (isErr(res)) throw res;
    },
  }, defaultBufferConfig);

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
        const result = applyAnswer(f, cardStateInLoop, toRating(state), new Date());
        // In-memory update
        cardsInThePage.set(cardStateInLoop.id, result.updated.card);
        // Persist (sequential for now)
        buffer.addCard(cardStateInLoop.id, result.updated.card);
        buffer.addLog({
          noteId: cardStateInLoop.noteId,
          ord: cardStateInLoop.ord,
          rating: result.log.rating as number,
          state: result.log.state as number,
          due: new Date(result.log.due as number | Date),
          stability: result.log.stability as number,
          difficulty: result.log.difficulty as number,
          elapsed_days: result.log.elapsed_days as number,
          last_elapsed_days: result.log.last_elapsed_days as number,
          scheduled_days: result.log.scheduled_days as number,
          learning_steps: result.log.learning_steps as number,
          review: new Date(result.log.review as number | Date),
        });
        await buffer.maybeFlush();
  answered++;
  updateMetricsAfterAnswer(metrics, cardStateInLoop, toRating(state));
  if (result.requeue) enqueue(queues, result.updated);
  // Try releasing buried siblings if card graduated to Review
  releaseBuriedIfGraduated(queues, result.updated);
      }

      // 次の問題を用意する
      cardStateInLoop = pickNext(queues);
      if (!cardStateInLoop) break; // session end
      style.textContent = makeQuestionModeCSS(
        cardStateInLoop.note,
        cardStateInLoop.ord,
      );
      getLineDOM([...cardStateInLoop.note.range][0])?.scrollIntoView?.({
        block: "center",
      });
      hud.update(queues, answered);
    }
  } catch (cause) {
    const error = new Error("An error occurred during the review.", { cause });
    showErrorToast(String(error), 8000);
    throw error;
  } finally {
    await buffer.flushAndDispose();
    style.remove();
    hud.remove();
    const summary = summarizeSession(answered, queues, {
      accuracy: computeAccuracy(metrics),
      lapses: metrics.lapses,
      newIntroduced: metrics.newIntroduced,
    });
    showInfoToast(
      `Session Finished. Answered: ${summary.answered}\nAccuracy: ${(summary.accuracy * 100).toFixed(1)}%  Lapses: ${summary.lapses}  New: ${summary.newIntroduced}`,
      8000,
    );
  }
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
