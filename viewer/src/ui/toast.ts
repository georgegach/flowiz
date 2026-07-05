/**
 * Toasts: stacked, dismissible, error/info variants. A single fixed container
 * holds them in a bottom-centre column so simultaneous messages never overlap
 * (the previous single-element approach pinned every toast to the same spot).
 */

export type ToastKind = "error" | "info";

const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`;
const INFO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>`;
const CLOSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container && container.isConnected) return container;
  container = document.createElement("div");
  container.className = "toasts";
  container.setAttribute("aria-label", "Notifications");
  document.body.appendChild(container);
  return container;
}

export function toast(msg: string, kind: ToastKind = "error"): void {
  const host = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.innerHTML = `
    <span class="toast-ico">${kind === "error" ? ERROR_SVG : INFO_SVG}</span>
    <span class="toast-msg"></span>
    <button class="toast-x" aria-label="Dismiss">${CLOSE_SVG}</button>`;
  el.querySelector<HTMLSpanElement>(".toast-msg")!.textContent = msg;

  let timer: number | null = null;
  const remove = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    el.remove();
  };
  el.querySelector<HTMLButtonElement>(".toast-x")!.addEventListener("click", remove);
  timer = window.setTimeout(remove, kind === "error" ? 5000 : 4000);
  host.appendChild(el);
}
