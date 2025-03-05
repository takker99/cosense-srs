/** @jsxRuntime automatic */
/** @jsxImportSource npm:preact@10 */
import { editor } from "@cosense/std/browser/dom";
import { type FunctionComponent, render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { Rating } from "ts-fsrs";

export interface FlashCardControllerProps {
  onStateChange: (
    state: "answer" | "exit" | "easy" | "good" | "hard" | "again",
  ) => void;
}

const FlashCardController: FunctionComponent<FlashCardControllerProps> = (
  { onStateChange },
) => {
  const [mode, setMode] = useState<"review" | "answer">("review");

  const showAnswer = useCallback(
    () => (setMode("answer"), onStateChange("answer")),
    [onStateChange],
  );
  const easy = useCallback(
    () => (setMode("review"), onStateChange("easy")),
    [onStateChange],
  );
  const good = useCallback(
    () => (setMode("review"), onStateChange("good")),
    [onStateChange],
  );
  const hard = useCallback(
    () => (setMode("review"), onStateChange("hard")),
    [onStateChange],
  );
  const again = useCallback(
    () => (setMode("review"), onStateChange("again")),
    [onStateChange],
  );
  const exit = useCallback(() => onStateChange("exit"), [onStateChange]);

  useEffect(() => {
    const controller = new AbortController();
    editor()!.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exit();
      } else if (mode === "review" && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        showAnswer();
      } else if (mode === "answer") {
        switch (parseInt(e.key)) {
          case Rating.Easy:
            easy();
            break;
          case Rating.Good:
            good();
            break;
          case Rating.Hard:
            hard();
            break;
          case Rating.Again:
            again();
            break;
          default:
            return;
        }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }, controller);
    return () => controller.abort();
  }, [mode, showAnswer, exit, easy, good, hard, again]);

  return (
    <>
      <style>
        {`ul.grade-list {
  position: fixed;
  bottom: 10vh;
  left: 10vw;

  font-size: 14px;
  font-family: var(--select-suggest-font-family, "Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif);
  color: var(--select-suggest-text-color, #eee);
  background-color: var(--select-suggest-bg, #111);
  border-radius: 5px;
  z-index: 301;

  padding: 8px 16px;
  list-style-type: none;

  display: flex;
  gap: 0.5em;

  li button {
    cursor: pointer;
    background: unset;
    color: unset;
    border: unset;
    border-radius: 5px;
    padding: 0.5em;

    &.answer, &.close {
      border: 1px solid #ccc;
    }

    &.again {
      background-color: oklch(0.7 0.3 40);
      &:hover {
        background-color: oklch(0.5 0.3 40);
      }
    }
    &.hard {
      background-color: oklch(0.7 0.3 60);
      &:hover {
        background-color: oklch(0.5 0.3 60);
      }
    }
    &.good {
      background-color: oklch(0.7 0.3 250);
      &:hover {
        background-color: oklch(0.6 0.3 260);
      }
    }
    &.easy {
      background-color: oklch(0.7 0.3 150);
      &:hover {
        background-color: oklch(0.6 0.3 150);
      }
    }
  }
}`}
      </style>
      <ul class="grade-list">
        {mode === "review"
          ? (
            <li>
              <button type="button" class="answer" onClick={showAnswer}>
                Show Answer
              </button>
            </li>
          )
          : (
            <>
              <li>
                <button type="button" class="again" onClick={again}>
                  Again
                </button>
              </li>
              <li>
                <button type="button" class="hard" onClick={hard}>
                  Hard
                </button>
              </li>
              <li>
                <button type="button" class="good" onClick={good}>
                  Good
                </button>
              </li>
              <li>
                <button type="button" class="easy" onClick={easy}>
                  Easy
                </button>
              </li>
            </>
          )}
        <li>
          <button type="button" class="close" onClick={exit}>x</button>
        </li>
      </ul>
    </>
  );
};

export const showFlashCardController = (): ReadableStream<
  "answer" | "easy" | "good" | "hard" | "again"
> => {
  const app = document.createElement("div");
  const shadowRoot = app.attachShadow({ mode: "open" });
  document.body.append(app);

  return new ReadableStream<"answer" | "easy" | "good" | "hard" | "again">({
    start(controller) {
      controller.enqueue("easy");
      const onStateChange = (
        state: "answer" | "exit" | "easy" | "good" | "hard" | "again",
      ) => {
        if (state === "exit") {
          app.remove();
          controller.close();
          return;
        }
        controller.enqueue(state);
      };
      render(<FlashCardController onStateChange={onStateChange} />, shadowRoot);
    },
    cancel() {
      app.remove();
    },
  });
};
