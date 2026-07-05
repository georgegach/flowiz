/**
 * Persistent topbar chip showing background flow-generation progress. Collapsed
 * it shows frames-done / total + queue length; clicking opens a popover with the
 * current phase, a Stop (keep frames) / Cancel control, and the queued videos
 * (each removable). Hidden when nothing is generating.
 */

import type { FlowJob } from "../flowgen/job-manager";
import type { ProgressKind } from "../flowgen/types";
import { formatProgress } from "./progress-format";

const SPIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>`;
const X_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

export interface StatusChip {
  el: HTMLElement;
  update(active: FlowJob | null, queue: readonly FlowJob[]): void;
  progress(job: FlowJob, phase: string, done: number, total: number, kind: ProgressKind): void;
}

export function createStatusChip(actions: {
  stop(id: number): void;
  cancel(id: number): void;
}): StatusChip {
  const el = document.createElement("div");
  el.className = "statuschip";
  el.hidden = true;
  el.innerHTML = `
    <button class="statuschip-btn" aria-expanded="false" aria-label="Generation status">
      <span class="statuschip-spin" aria-hidden="true">${SPIN_SVG}</span>
      <span class="statuschip-text"></span>
    </button>
    <div class="statuschip-pop" hidden>
      <div class="statuschip-phase"></div>
      <div class="loader-bar statuschip-bar"><div class="loader-fill statuschip-fill"></div></div>
      <div class="statuschip-actions">
        <button class="statuschip-stop">Stop &amp; keep</button>
        <button class="statuschip-cancel">Cancel</button>
      </div>
      <div class="statuschip-queue"></div>
    </div>`;

  const btn = el.querySelector<HTMLButtonElement>(".statuschip-btn")!;
  const textEl = el.querySelector<HTMLSpanElement>(".statuschip-text")!;
  const pop = el.querySelector<HTMLDivElement>(".statuschip-pop")!;
  const phaseEl = el.querySelector<HTMLDivElement>(".statuschip-phase")!;
  const barWrap = el.querySelector<HTMLDivElement>(".statuschip-bar")!;
  const fill = el.querySelector<HTMLDivElement>(".statuschip-fill")!;
  const stopBtn = el.querySelector<HTMLButtonElement>(".statuschip-stop")!;
  const cancelBtn = el.querySelector<HTMLButtonElement>(".statuschip-cancel")!;
  const queueEl = el.querySelector<HTMLDivElement>(".statuschip-queue")!;

  let activeId: number | null = null;

  const setOpen = (open: boolean) => {
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(pop.hidden));
  document.addEventListener("click", (e) => {
    if (!el.contains(e.target as Node)) setOpen(false);
  });
  stopBtn.addEventListener("click", () => {
    if (activeId != null) actions.stop(activeId);
  });
  cancelBtn.addEventListener("click", () => {
    if (activeId != null) actions.cancel(activeId);
  });

  const ACTIVE_PHASES = new Set(["starting", "decoding", "running"]);

  function update(active: FlowJob | null, queue: readonly FlowJob[]) {
    activeId = active?.id ?? null;
    if (!active && queue.length === 0) {
      el.hidden = true;
      setOpen(false);
      return;
    }
    el.hidden = false;
    const q = queue.length ? ` · queue ${queue.length}` : "";
    if (active) {
      const total = active.framesTotal || "?";
      textEl.textContent = ACTIVE_PHASES.has(active.status)
        ? `${active.framesDone} / ${total}${q}`
        : `${active.status}${q}`;
      stopBtn.disabled = active.status !== "running";
      cancelBtn.disabled = false;
    } else {
      textEl.textContent = `queued ${queue.length}`;
    }

    queueEl.innerHTML = "";
    if (queue.length) {
      const title = document.createElement("div");
      title.className = "statuschip-queue-t";
      title.textContent = "Queued";
      queueEl.appendChild(title);
      for (const j of queue) {
        const row = document.createElement("div");
        row.className = "statuschip-qrow";
        const name = document.createElement("span");
        name.className = "statuschip-qname";
        name.textContent = j.file.name;
        const rm = document.createElement("button");
        rm.className = "statuschip-qrm";
        rm.setAttribute("aria-label", `Remove ${j.file.name} from the queue`);
        rm.innerHTML = X_SVG;
        rm.addEventListener("click", () => actions.cancel(j.id));
        row.append(name, rm);
        queueEl.appendChild(row);
      }
    }
  }

  function progress(
    job: FlowJob,
    phase: string,
    done: number,
    total: number,
    kind: ProgressKind,
  ) {
    if (job.id !== activeId) return;
    const { pct, label } = formatProgress(phase, done, total, kind);
    phaseEl.textContent = label;
    if (pct == null) {
      barWrap.classList.add("indeterminate");
      fill.style.width = "40%";
    } else {
      barWrap.classList.remove("indeterminate");
      fill.style.width = `${pct}%`;
    }
  }

  return { el, update, progress };
}
