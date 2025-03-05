import { editor } from "@cosense/std/browser/dom";

export const waitKeydown = (key: string): Promise<void> =>
  new Promise((resolve) => {
    const controller = new AbortController();
    editor()!.addEventListener("keydown", (e) => {
      if (e.key !== key) return;
      e.preventDefault();
      e.stopPropagation();
      controller.abort();
      resolve();
    }, controller);
  });
