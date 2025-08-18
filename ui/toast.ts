/** Minimal toast system (no framework dependency) */
export type ToastType = "info" | "error";

export interface ToastOptions {
  type?: ToastType;
  timeoutMs?: number; // auto-dismiss; 0 or undefined = default 4000; negative => persist until close
}

let container: HTMLElement | null = null;

const ensureContainer = () => {
  if (container) return container;
  container = document.createElement("div");
  container.id = "cosense-srs-toast-root";
  container.style.position = "fixed";
  container.style.zIndex = "9999";
  container.style.top = "8px";
  container.style.right = "8px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "6px";
  container.style.pointerEvents = "none"; // let clicks pass except on toast itself
  document.body.appendChild(container);
  return container;
};

export const showToast = (message: string, opts: ToastOptions = {}) => {
  const root = ensureContainer();
  const type = opts.type ?? "info";
  const timeout = opts.timeoutMs === undefined ? 4000 : opts.timeoutMs;
  const el = document.createElement("div");
  el.style.pointerEvents = "auto";
  el.style.minWidth = "240px";
  el.style.maxWidth = "400px";
  el.style.font = "12px/1.4 ui-monospace,monospace";
  el.style.padding = "8px 10px";
  el.style.borderRadius = "6px";
  el.style.boxShadow = "0 2px 6px #0006";
  el.style.backdropFilter = "blur(4px)";
  el.style.background = type === "error" ? "#a00d" : "#222d";
  el.style.color = "#fff";
  el.style.position = "relative";
  el.textContent = message;
  // close button
  const btn = document.createElement("button");
  btn.textContent = "×";
  btn.style.position = "absolute";
  btn.style.top = "2px";
  btn.style.right = "4px";
  btn.style.border = "none";
  btn.style.background = "transparent";
  btn.style.color = "inherit";
  btn.style.cursor = "pointer";
  btn.onclick = () => el.remove();
  el.appendChild(btn);
  root.appendChild(el);
  if (timeout >= 0) {
    setTimeout(() => el.remove(), timeout);
  }
  return el;
};

export const showErrorToast = (message: string, timeoutMs?: number) =>
  showToast(message, { type: "error", timeoutMs });

export const showInfoToast = (message: string, timeoutMs?: number) =>
  showToast(message, { type: "info", timeoutMs });
