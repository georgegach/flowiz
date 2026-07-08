/**
 * Export dropdown replacing the single "Export PNG" button. PNG (current frame)
 * and GIF/ZIP are always available; MP4 is enabled only when a WebCodecs codec
 * probes OK. GIF/ZIP/MP4 encode in the flow worker and work for any loaded
 * sequence, not just generated ones.
 */

import type { FlowField } from "../flow";
import { FlowEngine } from "../flowgen/engine";

export interface ExportContext {
  getFrames: () => FlowField[];
  getCurrent: () => number;
  getFps: () => number;
  /** Current on-screen Max-flow normalizer, so exports match the preview. */
  getMaxFlow: () => number;
  canvas: HTMLCanvasElement;
  notify: (msg: string, kind?: "error" | "info") => void;
}

const DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function pickCodec(w: number, h: number): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const VE = (globalThis as any).VideoEncoder;
  if (!VE) return null;
  const ew = w + (w % 2);
  const eh = h + (h % 2);
  for (const codec of ["avc1.42001f", "vp09.00.10.08", "av01.0.04M.08"]) {
    try {
      const s = await VE.isConfigSupported({ codec, width: ew, height: eh });
      if (s.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function setupExportMenu(container: HTMLElement, ctx: ExportContext) {
  container.innerHTML = `
    <div class="export-menu">
      <button id="export" class="secondary">${DOWNLOAD_SVG}<span>Export bundle</span></button>
      <div id="export-pop" class="export-pop" hidden>
        <div class="export-actions">
          <button data-act="png">PNG — current frame</button>
          <button data-act="zip">Raw flow ZIP (.flo/.png/.pfm/.npy)</button>
          <button data-act="gif">Animated GIF</button>
          <button data-act="mp4" data-disabled="1">MP4 video</button>
        </div>
        <div class="export-progress" hidden aria-live="polite">
          <div class="export-prog-head"><span class="export-prog-label">Encoding…</span><span class="export-prog-pct"></span></div>
          <div class="export-prog-bar"><div class="export-prog-fill"></div></div>
        </div>
      </div>
    </div>`;

  const btn = container.querySelector<HTMLButtonElement>("#export")!;
  const pop = container.querySelector<HTMLDivElement>("#export-pop")!;
  const actionsBox = container.querySelector<HTMLDivElement>(".export-actions")!;
  const progressBox = container.querySelector<HTMLDivElement>(".export-progress")!;
  const progLabel = container.querySelector<HTMLSpanElement>(".export-prog-label")!;
  const progPct = container.querySelector<HTMLSpanElement>(".export-prog-pct")!;
  const progFill = container.querySelector<HTMLDivElement>(".export-prog-fill")!;
  const mp4Btn = container.querySelector<HTMLButtonElement>('[data-act="mp4"]')!;

  let busy = false;

  btn.addEventListener("click", async () => {
    if (busy) return; // keep the progress view up while encoding
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const f = ctx.getFrames()[0];
      if (f) {
        const codec = await pickCodec(f.width, f.height);
        mp4Btn.dataset.codec = codec ?? "";
        mp4Btn.dataset.disabled = codec ? "0" : "1";
        mp4Btn.title = codec ? "" : "No supported video codec in this browser";
      }
    }
  });
  document.addEventListener("click", (e) => {
    if (!busy && !container.contains(e.target as Node)) pop.hidden = true;
  });

  const setProgress = (label: string, done: number, total: number, kind: string) => {
    progLabel.textContent = label;
    if (total > 0 && kind !== "indeterminate") {
      const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
      progPct.textContent = `${pct}%`;
      progFill.style.width = `${pct}%`;
      progressBox.classList.remove("indeterminate");
    } else {
      progPct.textContent = "";
      progressBox.classList.add("indeterminate");
    }
  };

  const withEngine = async (fn: (e: FlowEngine) => Promise<Blob>, name: string, label: string) => {
    if (busy) return;
    busy = true;
    btn.classList.add("loading");
    actionsBox.hidden = true;
    progressBox.hidden = false;
    setProgress(`Preparing ${label}…`, 0, 0, "indeterminate");
    const engine = new FlowEngine();
    engine.onProgress = (phase, done, total, kind) => setProgress(`${phase}…`, done, total, kind);
    try {
      const blob = await fn(engine);
      setProgress("Saving…", 1, 1, "count");
      download(blob, name);
      ctx.notify(`Exported ${name}`, "info");
      pop.hidden = true;
    } catch (err) {
      // Keep the popover open on error so the message has context.
      ctx.notify((err as Error).message || `${label} export failed`);
    } finally {
      engine.dispose();
      busy = false;
      btn.classList.remove("loading");
      progressBox.hidden = true;
      actionsBox.hidden = false;
    }
  };

  pop.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    const act = b.dataset.act;
    const frames = ctx.getFrames();
    if (!frames.length) return;
    const base = (frames[0].name || "flow").replace(/\.[^.]+$/, "");
    if (act === "png") {
      ctx.canvas.toBlob((blob) => {
        if (blob) download(blob, (frames[ctx.getCurrent()]?.name ?? "flow") + ".png");
        else ctx.notify("Couldn't render the PNG from the canvas.");
      });
      pop.hidden = true;
    } else if (act === "zip") {
      withEngine((e) => e.encodeZip(frames, base), `${base}.zip`, "ZIP");
    } else if (act === "gif") {
      const mx = ctx.getMaxFlow();
      withEngine((e) => e.encodeGif(frames, ctx.getFps(), mx), `${base}.gif`, "GIF");
    } else if (act === "mp4") {
      if (b.dataset.disabled === "1") return;
      const mx = ctx.getMaxFlow();
      withEngine((e) => e.encodeMp4(frames, ctx.getFps(), mx, b.dataset.codec || "avc1.42001f"), `${base}.mp4`, "MP4");
    }
  });
}
