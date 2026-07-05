/**
 * "Generate flow from video" settings dialog. Picks a model + options and hands
 * the video(s) to the background job manager via ctx.enqueue — then closes
 * immediately. It no longer runs anything itself: decode, download and compute
 * happen in the job manager and stream into the viewer, with progress on the
 * topbar status chip.
 */

import type { DisPreset, DisTuning, GenOptions, ModelTier } from "../flowgen/types";
import type { JobSettings } from "../flowgen/job-manager";
import { RAFT_MODELS } from "../flowgen/models";
import { baseUrl } from "../flowgen/base-url";
import { isCached, clearAssetCache, assetCacheUsage } from "../flowgen/asset-cache";
import { openModal, type ModalHandle } from "./modal";

export interface GenerateContext {
  enqueue: (files: File[], settings: JobSettings) => void;
  notify: (msg: string, kind?: "error" | "info") => void;
}

interface GenModelOption {
  id: string;
  tier: ModelTier;
  label: string;
  bytes: number;
  raftModelId?: string;
}
// DIS on-disk size = opencv-dis.wasm (4,412,489) + opencv-dis.js (139,157).
const OPTIONS: GenModelOption[] = [
  { id: "dis", tier: "dis", label: "Fastest — DIS", bytes: 4_551_646 },
  ...RAFT_MODELS.map((m): GenModelOption => ({
    id: m.id,
    tier: "raft",
    label: m.label,
    bytes: m.bytes,
    raftModelId: m.id,
  })),
];
const fmtSize = (bytes: number) => `~${Math.round(bytes / 1e6)} MB`;
const fmtMB = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6"/></svg>`;

const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/** Persisted selection, migrating the legacy `flowiz.tier` value. */
function loadSelectedId(): string {
  const saved = lsGet("flowiz.model");
  if (saved && OPTIONS.some((o) => o.id === saved)) return saved;
  const legacy = lsGet("flowiz.tier");
  const migrated =
    legacy === "raft-large" ? "raft-large-360x480" : legacy === "dis" ? "dis" : null;
  if (migrated && OPTIONS.some((o) => o.id === migrated)) return migrated;
  return OPTIONS[0].id;
}

export function openGeneratePanel(files: File[], ctx: GenerateContext) {
  if (!files.length) return;
  let selectedId = loadSelectedId();
  const currentOption = (): GenModelOption =>
    OPTIONS.find((o) => o.id === selectedId) ?? OPTIONS[0];
  const webgpuSaved = lsGet("flowiz.webgpu") === "1";
  const fileLabel = files.length === 1 ? files[0].name : `${files.length} videos`;

  const root = document.createElement("div");
  root.className = "gen-modal";
  root.innerHTML = `
    <div class="gen-card loader-card">
      <div class="loader-title">Generate optical flow</div>
      <div class="gen-file">${fileLabel}</div>
      <div class="ctl">
        <label>Model</label>
        <div class="segmented" id="gen-tier" role="group" aria-label="Model">
          ${OPTIONS.map(
            (o) =>
              `<button data-id="${o.id}" aria-pressed="${o.id === selectedId}" class="${o.id === selectedId ? "active" : ""}">${o.label}<small>${fmtSize(o.bytes)} download</small></button>`,
          ).join("")}
        </div>
      </div>
      <div class="ctl row">
        <label>Frame stride
          <select id="gen-stride"><option>1</option><option selected>2</option><option>4</option><option>8</option></select>
        </label>
        <label>Resolution
          <select id="gen-res"><option value="360">360p</option><option value="480" selected>480p</option><option value="720">720p</option><option value="1080">1080p</option></select>
        </label>
      </div>
      <label class="gen-opt" id="gen-webgpu-row" title="WebGPU can be much faster for RAFT but support varies by browser/GPU. Off = the reliable WASM backend.">
        <input type="checkbox" id="gen-webgpu" ${webgpuSaved ? "checked" : ""}/> Try WebGPU for RAFT (experimental)
      </label>
      <details class="gen-advanced" id="gen-advanced">
        <summary>Advanced</summary>
        <div class="gen-adv-body">
          <div class="gen-dis-tuning" id="gen-dis-tuning">
            <label class="gen-adv-field">DIS preset
              <select id="gen-dis-preset">
                <option value="ultrafast">Ultrafast</option>
                <option value="fast" selected>Fast</option>
                <option value="medium">Medium</option>
              </select>
            </label>
            <div class="gen-dis-knobs">
              <label class="gen-adv-field">Finest scale<input id="dis-finest" type="number" min="0" step="1" placeholder="preset" /></label>
              <label class="gen-adv-field">Descent iters<input id="dis-gd" type="number" min="1" step="1" placeholder="preset" /></label>
              <label class="gen-adv-field">Patch size<input id="dis-patch" type="number" min="4" step="1" placeholder="preset" /></label>
            </div>
            <label class="gen-opt"><input type="checkbox" id="dis-varref" checked /> Variational refinement</label>
            <p class="gen-adv-note">Blank = preset default. Tuning needs a recent DIS build; older ones ignore it.</p>
          </div>
          <div class="gen-cache" id="gen-cache">
            <div class="gen-cache-row" id="gen-cache-model"></div>
            <div class="gen-cache-row" id="gen-cache-ffmpeg"></div>
            <button class="gen-cache-clear" id="gen-cache-clear" type="button">Clear cached downloads</button>
          </div>
        </div>
      </details>
      <div class="gen-actions">
        <button id="gen-cancel">Cancel</button>
        <button id="gen-go" class="primary">Generate</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const tierBox = q<HTMLDivElement>("#gen-tier");
  const goBtn = q<HTMLButtonElement>("#gen-go");
  const cancelBtn = q<HTMLButtonElement>("#gen-cancel");
  const strideSel = q<HTMLSelectElement>("#gen-stride");
  const resSel = q<HTMLSelectElement>("#gen-res");
  const webgpuCb = q<HTMLInputElement>("#gen-webgpu");
  const webgpuRow = q<HTMLLabelElement>("#gen-webgpu-row");
  const disTuningBox = q<HTMLDivElement>("#gen-dis-tuning");
  const disPresetSel = q<HTMLSelectElement>("#gen-dis-preset");
  const disFinest = q<HTMLInputElement>("#dis-finest");
  const disGd = q<HTMLInputElement>("#dis-gd");
  const disPatch = q<HTMLInputElement>("#dis-patch");
  const disVarRef = q<HTMLInputElement>("#dis-varref");
  const cacheModelRow = q<HTMLDivElement>("#gen-cache-model");
  const cacheFfmpegRow = q<HTMLDivElement>("#gen-cache-ffmpeg");
  const cacheClearBtn = q<HTMLButtonElement>("#gen-cache-clear");

  let modal: ModalHandle | null = null;

  // Restore persisted prefs.
  const savedStride = lsGet("flowiz.stride");
  if (savedStride) strideSel.value = savedStride;
  const savedRes = lsGet("flowiz.res");
  if (savedRes) resSel.value = savedRes;
  const savedPreset = lsGet("flowiz.dis.preset");
  if (savedPreset) disPresetSel.value = savedPreset;
  disFinest.value = lsGet("flowiz.dis.finest") ?? "";
  disGd.value = lsGet("flowiz.dis.gd") ?? "";
  disPatch.value = lsGet("flowiz.dis.patch") ?? "";
  disVarRef.checked = lsGet("flowiz.dis.varref") !== "0";

  const modelUrl = (): string => {
    const opt = currentOption();
    return opt.tier === "dis"
      ? `${baseUrl()}vendor/opencv/opencv-dis.wasm`
      : `${baseUrl()}models/${RAFT_MODELS.find((m) => m.id === opt.raftModelId)!.file}`;
  };
  const ffmpegUrl = () => `${baseUrl()}vendor/ffmpeg/core/ffmpeg-core.wasm`;

  const cacheLine = (label: string, cached: boolean, sizeBytes: number) =>
    cached
      ? `<span class="gen-cache-ok">${CHECK_SVG}</span> ${label} cached`
      : `<span class="gen-cache-dl"></span> ${label} — ${fmtSize(sizeBytes)} download`;

  async function refreshCache() {
    const opt = currentOption();
    const [modelHit, ffHit, usage] = await Promise.all([
      isCached(modelUrl()),
      isCached(ffmpegUrl()),
      assetCacheUsage(),
    ]);
    cacheModelRow.innerHTML = cacheLine("Model", modelHit, opt.bytes);
    cacheFfmpegRow.innerHTML = cacheLine("Video engine", ffHit, 32_000_000);
    cacheClearBtn.textContent =
      usage != null ? `Clear cached downloads (${fmtMB(usage)})` : "Clear cached downloads";
  }

  const syncVisibility = () => {
    const isRaft = currentOption().tier === "raft";
    webgpuRow.hidden = !isRaft;
    disTuningBox.hidden = isRaft;
  };
  syncVisibility();
  void refreshCache();

  tierBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    selectedId = b.dataset.id!;
    lsSet("flowiz.model", selectedId);
    tierBox.querySelectorAll("button").forEach((x) => {
      const on = x === b;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", String(on));
    });
    syncVisibility();
    void refreshCache();
  });

  webgpuCb.addEventListener("change", () =>
    lsSet("flowiz.webgpu", webgpuCb.checked ? "1" : "0"),
  );

  cacheClearBtn.addEventListener("click", async () => {
    cacheClearBtn.disabled = true;
    await clearAssetCache();
    await refreshCache();
    cacheClearBtn.disabled = false;
    ctx.notify("Cleared cached model downloads.", "info");
  });

  const close = () => {
    modal?.release();
    root.remove();
  };
  cancelBtn.addEventListener("click", close);

  const readDisTuning = (): DisTuning | undefined => {
    const t: DisTuning = {};
    const num = (el: HTMLInputElement) => {
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : undefined;
    };
    const fs = num(disFinest);
    if (fs != null) t.finestScale = fs;
    const gd = num(disGd);
    if (gd != null) t.gradientDescentIterations = gd;
    const ps = num(disPatch);
    if (ps != null) t.patchSize = ps;
    if (!disVarRef.checked) t.variationalRefinement = false;
    return Object.keys(t).length ? t : undefined;
  };

  goBtn.addEventListener("click", () => {
    const opt = currentOption();
    const stride = parseInt(strideSel.value, 10);
    const maxDim = parseInt(resSel.value, 10);
    const useGpu = opt.tier === "raft" && webgpuCb.checked;
    const opts: GenOptions = {
      tier: opt.tier,
      raftModelId: opt.raftModelId,
      ep: useGpu ? "auto" : "wasm",
    };
    if (opt.tier === "dis") {
      opts.disPreset = disPresetSel.value as DisPreset;
      const tuning = readDisTuning();
      if (tuning) opts.disTuning = tuning;
    }

    // Persist prefs.
    lsSet("flowiz.stride", strideSel.value);
    lsSet("flowiz.res", resSel.value);
    lsSet("flowiz.dis.preset", disPresetSel.value);
    lsSet("flowiz.dis.finest", disFinest.value);
    lsSet("flowiz.dis.gd", disGd.value);
    lsSet("flowiz.dis.patch", disPatch.value);
    lsSet("flowiz.dis.varref", disVarRef.checked ? "1" : "0");

    ctx.enqueue(files, { opts, stride, maxDim });
    close();
  });

  modal = openModal(root, {
    onRequestClose: close,
    initialFocus: goBtn,
    closeOnBackdrop: true,
  });
}
