/**
 * "Generate flow from video" modal. Picks a model tier + options, decodes the
 * video frame by frame, runs each pair through the worker, and hands the
 * resulting FlowField[] to the existing showFrames pipeline.
 *
 * Gives detailed async feedback throughout: model download (MB / %), session
 * init, per-frame compute with timing, the active backend, and inline errors
 * (the panel stays open so the message is readable and retryable).
 */

import type { FlowField } from "../flow";
import type { GenOptions, ModelTier, ProgressKind } from "../flowgen/types";
import { FlowEngine } from "../flowgen/engine";
import { openVideo, type VideoFrameSource } from "../video/decode";
import { openVideoFFmpeg } from "../video/ffmpeg-decode";

export interface GenerateContext {
  onFrames: (frames: FlowField[]) => void;
  notify: (msg: string) => void;
}

const TIERS: { id: ModelTier; label: string; size: string }[] = [
  { id: "dis", label: "Fastest — DIS", size: "~4 MB" },
  { id: "raft-large", label: "Best — RAFT (fp32)", size: "~61 MB" },
];

function baseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}

const fmtMB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
const fmtDur = (s: number) => (s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

export function openGeneratePanel(file: File, ctx: GenerateContext) {
  let tier: ModelTier = (localStorage.getItem("flowiz.tier") as ModelTier) || "dis";
  if (!TIERS.some((t) => t.id === tier)) tier = "dis";
  const webgpuSaved = localStorage.getItem("flowiz.webgpu") === "1";

  const root = document.createElement("div");
  root.className = "gen-modal";
  root.innerHTML = `
    <div class="gen-card loader-card">
      <div class="loader-title">Generate optical flow</div>
      <div class="gen-file">${file.name}</div>
      <div class="ctl">
        <label>Model</label>
        <div class="segmented" id="gen-tier">
          ${TIERS.map(
            (t) =>
              `<button data-tier="${t.id}" class="${t.id === tier ? "active" : ""}">${t.label}<small>${t.size}</small></button>`,
          ).join("")}
        </div>
      </div>
      <div class="ctl row">
        <label>Frame stride
          <select id="gen-stride"><option>1</option><option selected>2</option><option>4</option><option>8</option></select>
        </label>
        <label>Resolution
          <select id="gen-res"><option value="360">360p</option><option value="480" selected>480p</option><option value="720">720p</option><option value="1080">native</option></select>
        </label>
      </div>
      <label class="gen-opt" id="gen-webgpu-row" title="WebGPU can be much faster for RAFT but support varies by browser/GPU. Off = the reliable WASM backend.">
        <input type="checkbox" id="gen-webgpu" ${webgpuSaved ? "checked" : ""}/> Try WebGPU for RAFT (experimental)
      </label>
      <div class="gen-badge" id="gen-badge" hidden></div>
      <div class="gen-progress" id="gen-progress" hidden>
        <div class="loader-bar" id="gen-barwrap"><div class="loader-fill" id="gen-fill"></div></div>
        <div class="loader-meta" id="gen-meta"></div>
      </div>
      <div class="gen-error" id="gen-error" hidden></div>
      <div class="gen-actions">
        <button id="gen-cancel">Cancel</button>
        <button id="gen-go" class="primary">Generate</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const tierBox = root.querySelector<HTMLDivElement>("#gen-tier")!;
  const badge = root.querySelector<HTMLDivElement>("#gen-badge")!;
  const progressWrap = root.querySelector<HTMLDivElement>("#gen-progress")!;
  const barwrap = root.querySelector<HTMLDivElement>("#gen-barwrap")!;
  const fill = root.querySelector<HTMLDivElement>("#gen-fill")!;
  const meta = root.querySelector<HTMLDivElement>("#gen-meta")!;
  const errorEl = root.querySelector<HTMLDivElement>("#gen-error")!;
  const goBtn = root.querySelector<HTMLButtonElement>("#gen-go")!;
  const cancelBtn = root.querySelector<HTMLButtonElement>("#gen-cancel")!;
  const strideSel = root.querySelector<HTMLSelectElement>("#gen-stride")!;
  const resSel = root.querySelector<HTMLSelectElement>("#gen-res")!;
  const webgpuCb = root.querySelector<HTMLInputElement>("#gen-webgpu")!;
  const webgpuRow = root.querySelector<HTMLLabelElement>("#gen-webgpu-row")!;

  let engine: FlowEngine | null = null;
  let cancelled = false;
  let running = false;
  let stopRequested = false;

  const syncWebgpuVisibility = () => {
    // WebGPU only matters for the RAFT (onnxruntime) tier.
    webgpuRow.hidden = tier !== "raft-large";
  };
  syncWebgpuVisibility();

  tierBox.addEventListener("click", (e) => {
    if (running) return;
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    tier = b.dataset.tier as ModelTier;
    localStorage.setItem("flowiz.tier", tier);
    tierBox.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    syncWebgpuVisibility();
  });
  webgpuCb.addEventListener("change", () =>
    localStorage.setItem("flowiz.webgpu", webgpuCb.checked ? "1" : "0"),
  );

  const setProgress = (phase: string, done: number, total: number, kind: ProgressKind) => {
    progressWrap.hidden = false;
    errorEl.hidden = true;
    if (kind === "bytes" && total > 0 && done <= total * 1.02) {
      const pct = Math.min(100, Math.round((done / total) * 100));
      barwrap.classList.remove("indeterminate");
      fill.style.width = `${pct}%`;
      meta.textContent = `${phase} — ${fmtMB(done)} / ${fmtMB(total)} (${pct}%)`;
    } else if (kind === "bytes") {
      // `total` is a gzip-compressed content-length (GitHub Pages) or unknown,
      // so the stream delivers more (decompressed) bytes than `total` — show
      // downloaded MB against an indeterminate bar instead of a bogus percent.
      barwrap.classList.add("indeterminate");
      fill.style.width = "40%";
      meta.textContent = `${phase} — ${fmtMB(done)}`;
    } else if (kind === "count" && total > 0) {
      const pct = Math.min(100, Math.round((done / total) * 100));
      barwrap.classList.remove("indeterminate");
      fill.style.width = `${pct}%`;
      meta.textContent = phase;
    } else {
      barwrap.classList.add("indeterminate");
      fill.style.width = "40%";
      meta.textContent = `${phase}…`;
    }
  };

  const showError = (message: string) => {
    progressWrap.hidden = true;
    badge.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = message;
    goBtn.disabled = false;
    goBtn.textContent = "Try again";
    tierBox.style.pointerEvents = "";
    running = false;
    engine?.dispose();
    engine = null;
  };

  const close = () => {
    cancelled = true;
    engine?.dispose();
    root.remove();
  };
  cancelBtn.addEventListener("click", close);

  // Early stop: halt the compute loop but keep whatever frames are already done.
  const requestStop = () => {
    if (!running || stopRequested) return;
    stopRequested = true;
    goBtn.textContent = "Stopping…";
    goBtn.disabled = true;
  };

  const run = async () => {
    if (running) return;
    running = true;
    cancelled = false;
    stopRequested = false;
    errorEl.hidden = true;
    badge.hidden = true;
    // The primary button becomes the stop control while a run is in flight.
    goBtn.disabled = false;
    goBtn.textContent = "Stop & show";
    tierBox.style.pointerEvents = "none";

    const stride = parseInt(strideSel.value, 10);
    const maxDim = parseInt(resSel.value, 10);
    const useGpu = tier === "raft-large" && webgpuCb.checked;
    const opts: GenOptions = { tier, ep: useGpu ? "auto" : "wasm", disPreset: "fast" };

    try {
      // Normalise + downscale any input through ffmpeg.wasm (handles 4K, HEVC,
      // .mov/.mkv, etc.) with real decode progress. Fall back to the browser's
      // own <video> decoder if the engine can't load.
      setProgress("Preparing video engine", 0, 0, "indeterminate");
      let src: VideoFrameSource;
      try {
        src = await openVideoFFmpeg(file, { stride, maxDim }, setProgress, baseUrl());
      } catch (ffErr) {
        ctx.notify("ffmpeg unavailable — using the browser decoder.");
        setProgress(`Opening video (browser decoder)`, 0, 0, "indeterminate");
        console.warn("ffmpeg decode failed, falling back to <video>:", ffErr);
        src = await openVideo(file, { stride, maxDim });
      }

      engine = new FlowEngine();
      engine.onProgress = setProgress; // download + session-init phases
      const ep = await engine.init(opts, baseUrl());
      badge.hidden = false;
      badge.textContent = `Backend: ${ep.toUpperCase()}`;

      const flows: FlowField[] = [];
      const total = Math.max(1, src.frameCount - 1);
      const stem = file.name.replace(/\.[^.]+$/, "");
      const t0 = performance.now();
      let i = 0;
      setProgress("Computing flow", 0, total, "count");
      for await (const frame of src.frames()) {
        if (cancelled || stopRequested) break;
        const flow = await engine.pushFrame(frame, i++);
        if (flow) {
          flow.name = `${stem}_${String(flows.length + 1).padStart(4, "0")}.flo`;
          flows.push(flow);
          const secs = (performance.now() - t0) / 1000;
          const per = secs / flows.length;
          setProgress(
            `Computing flow ${flows.length} / ${total} · ${fmtDur(per)}/frame`,
            flows.length,
            total,
            "count",
          );
        }
      }
      src.close();
      if (cancelled) return;
      if (flows.length) {
        // Completed, or stopped early with partial results — show what we have.
        engine.dispose();
        engine = null;
        root.remove();
        ctx.onFrames(flows);
        if (stopRequested)
          ctx.notify(`Stopped — showing ${flows.length} frame${flows.length > 1 ? "s" : ""} generated so far.`);
        return;
      }
      if (stopRequested) {
        close(); // stopped before any frame was computed — nothing to show
        return;
      }
      throw new Error("No flow frames were produced (video too short for this stride?).");
    } catch (err) {
      if (cancelled) return;
      showError((err as Error)?.message || String(err) || "Generation failed.");
    }
  };

  // Same button starts the run, then acts as the stop control while it runs.
  goBtn.addEventListener("click", () => (running ? requestStop() : run()));
}
