/**
 * Lightweight modal helper: Escape to close, optional backdrop-click close, a
 * Tab focus trap, and focus restore. A shared open-count lets the rest of the
 * app ask isModalOpen() — used to suspend global keyboard shortcuts (arrow-key
 * frame scrubbing) while a dialog is up.
 */

let openCount = 0;
export const isModalOpen = (): boolean => openCount > 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalHandle {
  release(): void;
}

export interface ModalOptions {
  onRequestClose: () => void;
  initialFocus?: HTMLElement | null;
  /** Close on a click on the backdrop (root itself). Boolean or predicate; default true. */
  closeOnBackdrop?: boolean | (() => boolean);
}

export function openModal(root: HTMLElement, opts: ModalOptions): ModalHandle {
  openCount++;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      // offsetParent is null for display:none / hidden elements — skip them so
      // the trap never lands on an invisible control.
      (el) => el.offsetParent !== null || el === document.activeElement,
    );

  const first = opts.initialFocus ?? focusables()[0] ?? root;
  if (first === root && !root.hasAttribute("tabindex")) root.tabIndex = -1;
  first.focus?.({ preventScroll: true });

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      opts.onRequestClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables();
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === firstEl || !root.contains(active)) {
        e.preventDefault();
        lastEl.focus();
      }
    } else if (active === lastEl || !root.contains(active)) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  document.addEventListener("keydown", onKeydown, true);

  // Backdrop close only when BOTH mousedown and click land on the root itself —
  // a drag that starts inside the card (text selection) then releases on the
  // backdrop must not close the dialog.
  let downOnRoot = false;
  const onMousedown = (e: MouseEvent) => {
    downOnRoot = e.target === root;
  };
  const onClick = (e: MouseEvent) => {
    if (e.target !== root || !downOnRoot) return;
    downOnRoot = false;
    const allow =
      typeof opts.closeOnBackdrop === "function"
        ? opts.closeOnBackdrop()
        : opts.closeOnBackdrop !== false;
    if (allow) opts.onRequestClose();
  };
  root.addEventListener("mousedown", onMousedown);
  root.addEventListener("click", onClick);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      openCount = Math.max(0, openCount - 1);
      document.removeEventListener("keydown", onKeydown, true);
      root.removeEventListener("mousedown", onMousedown);
      root.removeEventListener("click", onClick);
      if (previouslyFocused && previouslyFocused.isConnected)
        previouslyFocused.focus?.({ preventScroll: true });
    },
  };
}
