/**
 * "Generate flow from video" modal. Picks a model tier + stride + resolution,
 * decodes the video frame by frame, runs each pair through the worker, and hands
 * the resulting FlowField[] to the existing showFrames pipeline.
 */

import type { FlowField } from "../flow";
import type { GenOptions, ModelTier } from "../flowgen/types";
import { FlowEngine } from "../flowgen/engine";
import { openVideo } from "../video/decode";

export interface GenerateContext {
  onFrames: (frames: FlowField[]) => void;
  notify: (msg: string) => void;
}

const TIERS: { id: ModelTier; label: string; size: string }[] = [
  { id: "dis", label: "Fastest — DIS", size: "~4 MB" },
  { id: "raft-small", label: "Optimal — RAFT (int8)", size: "~48 MB" },
  { id: "raft-large", label: "Best — RAFT (fp32)", size: "~61 MB" },
];

function baseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}

export function openGeneratePanel(file: File, ctx: GenerateContext) {
  const savedTier = (localStorage.getItem("flowiz.tier") as ModelTier) || "dis";
  const root = document.createElement("div");
  root.className = "gen-modal";
  root.innerHTML = `
    <div class="gen-card loader-card">
      <div class="loader-title">Generate optical flow</div>
      <div class="gen-file" id="gen-file">${file.name}</div>
      <div class="ctl">
        <label>Model</label>
        <div class="segmented" id="gen-tier">
          ${TIERS.map(
            (t) =>
              `<button data-tier="${t.id}" class="${t.id === savedTier ? "active" : ""}">${t.label}<small>${t.size}</small></button>`,
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
      <div class="gen-badge" id="gen-badge" hidden></div>
      <div class="loader-bar" hidden id="gen-barwrap"><div class="loader-fill" id="gen-fill"></div></div>
      <div class="loader-meta" id="gen-meta"></div>
      <div class="gen-actions">
        <button id="gen-cancel">Cancel</button>
        <button id="gen-go" class="primary">Generate</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const tierBox = root.querySelector<HTMLDivElement>("#gen-tier")!;
  const badge = root.querySelector<HTMLDivElement>("#gen-badge")!;
  const barwrap = root.querySelector<HTMLDivElement>("#gen-barwrap")!;
  const fill = root.querySelector<HTMLDivElement>("#gen-fill")!;
  const meta = root.querySelector<HTMLDivElement>("#gen-meta")!;
  const goBtn = root.querySelector<HTMLButtonElement>("#gen-go")!;
  const cancelBtn = root.querySelector<HTMLButtonElement>("#gen-cancel")!;
  const strideSel = root.querySelector<HTMLSelectElement>("#gen-stride")!;
  const resSel = root.querySelector<HTMLSelectElement>("#gen-res")!;

  let tier: ModelTier = savedTier;
  let engine: FlowEngine | null = null;
  let cancelled = false;

  tierBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    tier = b.dataset.tier as ModelTier;
    localStorage.setItem("flowiz.tier", tier);
    tierBox.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
  });

  const close = () => {
    cancelled = true;
    engine?.dispose();
    root.remove();
  };
  cancelBtn.addEventListener("click", close);

  goBtn.addEventListener("click", async () => {
    goBtn.disabled = true;
    tierBox.style.pointerEvents = "none";
    barwrap.hidden = false;
    const stride = parseInt(strideSel.value, 10);
    const maxDim = parseInt(resSel.value, 10);
    const opts: GenOptions = { tier, ep: "auto", disPreset: "fast" };

    try {
      meta.textContent = "Opening video…";
      const src = await openVideo(file, { stride, maxDim });
      meta.textContent = "Loading model…";
      engine = new FlowEngine();
      const ep = await engine.init(opts, baseUrl());
      badge.hidden = false;
      badge.textContent = `Backend: ${ep.toUpperCase()}`;

      const flows: FlowField[] = [];
      const total = Math.max(1, src.frameCount - 1);
      const stem = file.name.replace(/\.[^.]+$/, "");
      let i = 0;
      for await (const frame of src.frames()) {
        if (cancelled) break;
        const flow = await engine.pushFrame(frame, i++);
        if (flow) {
          flow.name = `${stem}_${String(flows.length + 1).padStart(4, "0")}.flo`;
          flows.push(flow);
          fill.style.width = `${Math.round((flows.length / total) * 100)}%`;
          meta.textContent = `Computing flow… ${flows.length} / ${total}`;
        }
      }
      src.close();
      if (cancelled) return;
      if (!flows.length) throw new Error("No flow frames were produced (video too short?).");
      engine.dispose();
      engine = null;
      root.remove();
      ctx.onFrames(flows);
    } catch (err) {
      ctx.notify((err as Error).message);
      close();
    }
  });
}
