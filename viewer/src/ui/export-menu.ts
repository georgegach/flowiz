/**
 * Export dropdown replacing the single "Export PNG" button. PNG (current frame)
 * and GIF/ZIP are always available; MP4 is enabled only when a WebCodecs codec
 * probes OK. GIF/ZIP/MP4 encode in the flow worker and work for any loaded
 * sequence, not just generated ones.
 */

import type { FlowField } from "../flow";
import { FlowEngine } from "../flowgen/engine";
import { sequenceMaxFlow } from "../export/colorize";

export interface ExportContext {
  getFrames: () => FlowField[];
  getCurrent: () => number;
  getFps: () => number;
  canvas: HTMLCanvasElement;
  notify: (msg: string) => void;
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
        <button data-act="png">PNG — current frame</button>
        <button data-act="zip">Raw flow ZIP (.flo/.png/.pfm/.npy)</button>
        <button data-act="gif">Animated GIF</button>
        <button data-act="mp4" data-disabled="1">MP4 video</button>
      </div>
    </div>`;

  const btn = container.querySelector<HTMLButtonElement>("#export")!;
  const pop = container.querySelector<HTMLDivElement>("#export-pop")!;
  const mp4Btn = container.querySelector<HTMLButtonElement>('[data-act="mp4"]')!;

  btn.addEventListener("click", async () => {
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
    if (!container.contains(e.target as Node)) pop.hidden = true;
  });

  let busy = false;
  const withEngine = async (fn: (e: FlowEngine) => Promise<Blob>, name: string) => {
    if (busy) return;
    busy = true;
    btn.classList.add("loading");
    const engine = new FlowEngine();
    try {
      const blob = await fn(engine);
      download(blob, name);
    } catch (err) {
      ctx.notify((err as Error).message);
    } finally {
      engine.dispose();
      busy = false;
      btn.classList.remove("loading");
      pop.hidden = true;
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
      });
      pop.hidden = true;
    } else if (act === "zip") {
      withEngine((e) => e.encodeZip(frames, base), `${base}.zip`);
    } else if (act === "gif") {
      const mx = sequenceMaxFlow(frames);
      withEngine((e) => e.encodeGif(frames, ctx.getFps(), mx), `${base}.gif`);
    } else if (act === "mp4") {
      if (b.dataset.disabled === "1") return;
      const mx = sequenceMaxFlow(frames);
      withEngine((e) => e.encodeMp4(frames, ctx.getFps(), mx, b.dataset.codec || "avc1.42001f"), `${base}.mp4`);
    }
  });
}
