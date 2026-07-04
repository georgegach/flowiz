import "./style.css";
import { FlowRenderer, type Mode } from "./render";
import { parseByName, maxMagnitude, type FlowField } from "./flow";
import { EXAMPLES } from "./examples";
import { openLearn, initLearnFromHash } from "./learn";

const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
const THEME_SVG = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg><svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><svg class="brand-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12a2.4 2.4 0 1 0-2.4-2.4A4.8 4.8 0 1 0 14.4 14.4 7.2 7.2 0 1 1 7.2 7.2"/></svg><strong>flowiz</strong> <span class="ver">viewer</span></div>
    <nav>
      <button id="learn-btn" class="learn-trigger">Learn</button>
      <a href="./docs/" target="_blank" rel="noopener">Docs</a>
      <a href="https://github.com/georgegach/flowiz" target="_blank" rel="noopener">GitHub</a>
      <button id="theme" title="Toggle theme" aria-label="Toggle theme">${THEME_SVG}</button>
    </nav>
  </header>

  <main>
    <section id="stage" class="stage">
      <div id="drop" class="dropzone">
        <div class="drop-inner">
          <div class="big">Drop optical flow files here</div>
          <div class="sub">.flo · KITTI .png · .pfm · .npy — everything stays on your machine</div>
          <label class="pick">Choose files<input id="file" type="file" multiple accept=".flo,.png,.pfm,.npy" hidden /></label>
          <div class="examples">
            <span class="ex-label">or try an example</span>
            <div id="examples" class="ex-buttons"></div>
          </div>
          <button id="learn-link" class="learn-hint">New to optical flow? Start here →</button>
        </div>
      </div>
      <canvas id="canvas" hidden></canvas>
      <canvas id="arrows" class="arrows" hidden></canvas>
      <div id="inspector" class="inspector" hidden></div>
      <img id="legend" class="legend" hidden alt="color wheel legend" />
    </section>

    <aside id="controls" class="controls" hidden>
      <div class="ctl">
        <label>Encoding</label>
        <div class="segmented" id="mode">
          <button data-mode="rgb" class="active">Color</button>
          <button data-mode="uv">UV</button>
          <button data-mode="mag">Magnitude</button>
          <button data-mode="angle">Angle</button>
        </div>
      </div>
      <div class="ctl">
        <div class="maxflow-head"><label>Max flow</label><span id="maxval" class="val-chip"></span></div>
        <input id="maxflow" type="range" min="0.1" max="100" step="0.1" />
      </div>
      <div class="ctl row">
        <label><input id="mask" type="checkbox" checked /> Mask invalid</label>
        <label><input id="showlegend" type="checkbox" /> Overlay legend</label>
        <label><input id="showarrows" type="checkbox" /> Arrows</label>
      </div>

      <div class="ctl playback" id="playback" hidden>
        <label>Playback</label>
        <div class="play-row">
          <button id="play" class="play-btn" title="Play / pause" aria-label="Play / pause">${PLAY_SVG}</button>
          <input id="fps" type="range" min="1" max="30" step="1" value="8" />
          <span id="fpsval" class="fps-val">8 fps</span>
        </div>
      </div>

      <div class="ctl">
        <button id="export" class="primary">Export PNG</button>
      </div>

      <div class="ctl wheel-ctl">
        <label>Color wheel</label>
        <canvas id="wheelpanel" class="wheel-panel" width="128" height="128"></canvas>
        <div class="wheel-note">hue = direction · brightness = magnitude</div>
      </div>

      <div id="stats" class="stats"></div>
      <div id="filmstrip" class="filmstrip"></div>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const drop = document.querySelector<HTMLDivElement>("#drop")!;
const controls = document.querySelector<HTMLElement>("#controls")!;
const inspector = document.querySelector<HTMLDivElement>("#inspector")!;
const legendImg = document.querySelector<HTMLImageElement>("#legend")!;
const maxflow = document.querySelector<HTMLInputElement>("#maxflow")!;
const maxval = document.querySelector<HTMLSpanElement>("#maxval")!;
const maskCb = document.querySelector<HTMLInputElement>("#mask")!;
const legendCb = document.querySelector<HTMLInputElement>("#showlegend")!;
const statsEl = document.querySelector<HTMLDivElement>("#stats")!;
const filmstrip = document.querySelector<HTMLDivElement>("#filmstrip")!;
const playbackSection = document.querySelector<HTMLDivElement>("#playback")!;
const playBtn = document.querySelector<HTMLButtonElement>("#play")!;
const fpsInput = document.querySelector<HTMLInputElement>("#fps")!;
const fpsVal = document.querySelector<HTMLSpanElement>("#fpsval")!;
const wheelPanel = document.querySelector<HTMLCanvasElement>("#wheelpanel")!;
const stageEl = document.querySelector<HTMLElement>("#stage")!;
const arrowsCanvas = document.querySelector<HTMLCanvasElement>("#arrows")!;
const arrowsCb = document.querySelector<HTMLInputElement>("#showarrows")!;

let renderer: FlowRenderer | null = null;
let frames: FlowField[] = [];
let current = 0;
let mode: Mode = "rgb";
let playTimer: number | null = null;

function draw() {
  if (!renderer || !frames[current]) return;
  renderer.render({
    maxFlow: parseFloat(maxflow.value),
    mode,
    maskInvalid: maskCb.checked,
  });
  updateStats();
  drawArrows();
}

// --- swirl indicator: sparse directional arrows over the flow ---
function drawArrowGlyph(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  len: number,
) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = Math.min(4, len * 0.45); // proportional head → short arrows stay tidy
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a + 0.5), y1 - head * Math.sin(a + 0.5));
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // thin dark halo then light stroke → readable on any background color
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2.0;
  trace();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.25;
  trace();
  ctx.stroke();
}

function drawArrows() {
  const f = frames[current];
  if (!arrowsCb.checked || !f || canvas.hidden) {
    arrowsCanvas.hidden = true;
    return;
  }
  const cr = canvas.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  const cssW = cr.width;
  const cssH = cr.height;
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  arrowsCanvas.hidden = false;
  arrowsCanvas.width = Math.round(cssW * ratio);
  arrowsCanvas.height = Math.round(cssH * ratio);
  arrowsCanvas.style.width = `${cssW}px`;
  arrowsCanvas.style.height = `${cssH}px`;
  arrowsCanvas.style.left = `${cr.left - sr.left}px`;
  arrowsCanvas.style.top = `${cr.top - sr.top}px`;

  const ctx = arrowsCanvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const maxFlow = parseFloat(maxflow.value) || maxMagnitude(f) || 1;
  const spacing = 34; // display px between arrows → fairly sparse
  const maxLen = spacing * 0.55;
  const sx = cssW / f.width;
  const sy = cssH / f.height;

  for (let py = spacing / 2; py < cssH; py += spacing) {
    for (let px = spacing / 2; px < cssW; px += spacing) {
      const fx = Math.floor(px / sx);
      const fy = Math.floor(py / sy);
      if (fx < 0 || fy < 0 || fx >= f.width || fy >= f.height) continue;
      const idx = fy * f.width + fx;
      if (maskCb.checked && f.valid && !f.valid[idx]) continue;
      const u = f.data[idx * 2];
      const v = f.data[idx * 2 + 1];
      const mag = Math.hypot(u, v);
      if (!isFinite(mag) || mag < maxFlow * 0.06) continue; // skip near-still pixels
      const norm = Math.min(1, mag / maxFlow);
      const len = 3 + norm * (maxLen - 3);
      const ang = Math.atan2(v, u);
      ctx.globalAlpha = 0.35 + 0.65 * norm; // still regions fade out
      drawArrowGlyph(ctx, px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len, len);
    }
  }
  ctx.globalAlpha = 1;
}

function loadFrame(i: number) {
  const f = frames[i];
  if (!f) return;
  current = i;
  if (!renderer) renderer = new FlowRenderer(canvas);
  renderer.upload(f);
  const mx = maxMagnitude(f);
  maxflow.max = String(Math.max(1, Math.ceil(mx * 1.5)));
  maxflow.value = String(Math.max(0.1, mx));
  maxval.textContent = mx.toFixed(2);
  draw();
  highlightStrip();
}

function updateStats() {
  const f = frames[current];
  if (!f) return;
  const mx = maxMagnitude(f);
  statsEl.innerHTML = `
    <div><span>Frame</span><b>${current + 1} / ${frames.length}</b></div>
    <div><span>Size</span><b>${f.width}×${f.height}</b></div>
    <div><span>Max |flow|</span><b>${mx.toFixed(3)} px</b></div>
    <div><span>File</span><b class="fname">${f.name}</b></div>`;
}

function buildFilmstrip() {
  filmstrip.innerHTML = "";
  frames.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "thumb";
    b.textContent = String(i + 1);
    b.title = f.name;
    b.onclick = () => loadFrame(i);
    filmstrip.appendChild(b);
  });
  filmstrip.hidden = frames.length < 2;
}

function highlightStrip() {
  filmstrip.querySelectorAll(".thumb").forEach((el, i) =>
    el.classList.toggle("active", i === current),
  );
}

async function handleFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList);
  const parsed: FlowField[] = [];
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      parsed.push(parseByName(buf, file.name));
    } catch (e) {
      showError((e as Error).message);
    }
  }
  if (!parsed.length) return;
  showFrames(parsed);
}

function showFrames(parsed: FlowField[]) {
  stopPlayback();
  frames = parsed.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  drop.hidden = true;
  canvas.hidden = false;
  controls.hidden = false;
  playbackSection.hidden = frames.length < 2;
  buildFilmstrip();
  loadFrame(0);
  renderLegend();
  renderWheelPanel();
}

// --- movie playback ---
function stopPlayback() {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
  }
  playBtn.innerHTML = PLAY_SVG;
  playBtn.classList.remove("playing");
}

function startPlayback() {
  if (frames.length < 2) return;
  const fps = parseInt(fpsInput.value, 10);
  playBtn.innerHTML = PAUSE_SVG;
  playBtn.classList.add("playing");
  playTimer = window.setInterval(() => {
    loadFrame((current + 1) % frames.length);
  }, 1000 / fps);
}

function togglePlayback() {
  if (playTimer !== null) stopPlayback();
  else startPlayback();
}

playBtn.addEventListener("click", togglePlayback);
fpsInput.addEventListener("input", () => {
  fpsVal.textContent = `${fpsInput.value} fps`;
  if (playTimer !== null) {
    stopPlayback();
    startPlayback();
  }
});

// Shipped examples in the dropzone.
const examplesEl = document.querySelector<HTMLDivElement>("#examples")!;
for (const ex of EXAMPLES) {
  const b = document.createElement("button");
  b.className = "ex-btn";
  b.textContent = ex.label;
  b.onclick = async () => {
    b.disabled = true;
    b.classList.add("loading");
    try {
      showFrames(await ex.load());
    } catch (e) {
      showError((e as Error).message);
    } finally {
      b.disabled = false;
      b.classList.remove("loading");
    }
  };
  examplesEl.appendChild(b);
}

function showError(msg: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// --- color wheel painter: supersampled backing store + edge anti-aliasing ---
async function paintWheel(ctx: CanvasRenderingContext2D, px: number) {
  const { uvToColor } = await import("./colorwheel");
  const img = ctx.createImageData(px, px);
  const r = px / 2;
  const band = 2.0 / r; // width of the anti-aliased rim, in normalized units
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5 - r) / r;
      const v = (y + 0.5 - r) / r;
      const rad = Math.hypot(u, v);
      const idx = (y * px + x) * 4;
      if (rad >= 1) {
        img.data[idx + 3] = 0;
        continue;
      }
      const [cr, cg, cb] = uvToColor(u, v);
      img.data[idx] = cr;
      img.data[idx + 1] = cg;
      img.data[idx + 2] = cb;
      img.data[idx + 3] = rad > 1 - band ? Math.round((255 * (1 - rad)) / band) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function backingSize(cssSize: number): number {
  // 2x supersampling on top of the device pixel ratio for a crisp wheel.
  const ratio = Math.min(3, window.devicePixelRatio || 1) * 2;
  return Math.round(cssSize * ratio);
}

// Floating on-canvas legend (opt-in via the checkbox).
function renderLegend() {
  const css = 96;
  const px = backingSize(css);
  const c = document.createElement("canvas");
  c.width = c.height = px;
  paintWheel(c.getContext("2d")!, px).then(() => {
    legendImg.src = c.toDataURL();
  });
}

// Color wheel in the right-side panel (always visible while viewing).
function renderWheelPanel() {
  const css = 128;
  const px = backingSize(css);
  wheelPanel.width = px;
  wheelPanel.height = px;
  wheelPanel.style.width = `${css}px`;
  wheelPanel.style.height = `${css}px`;
  paintWheel(wheelPanel.getContext("2d")!, px);
}

// --- inspector: per-pixel readout on hover ---
canvas.addEventListener("mousemove", (e) => {
  const f = frames[current];
  if (!f) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * f.width);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * f.height);
  if (x < 0 || y < 0 || x >= f.width || y >= f.height) return;
  const i = (y * f.width + x) * 2;
  const u = f.data[i];
  const v = f.data[i + 1];
  inspector.hidden = false;
  inspector.style.left = `${e.clientX - rect.left + 14}px`;
  inspector.style.top = `${e.clientY - rect.top + 14}px`;
  inspector.innerHTML = `
    <div>x,y <b>${x},${y}</b></div>
    <div>u <b>${u.toFixed(3)}</b></div>
    <div>v <b>${v.toFixed(3)}</b></div>
    <div>|·| <b>${Math.hypot(u, v).toFixed(3)}</b></div>
    <div>∠ <b>${((Math.atan2(v, u) * 180) / Math.PI).toFixed(1)}°</b></div>`;
});
canvas.addEventListener("mouseleave", () => (inspector.hidden = true));

// --- controls wiring ---
document.querySelector("#mode")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  mode = btn.dataset.mode as Mode;
  document.querySelectorAll("#mode button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  draw();
});
maxflow.addEventListener("input", () => {
  maxval.textContent = parseFloat(maxflow.value).toFixed(2);
  draw();
});
maskCb.addEventListener("change", draw);
legendCb.addEventListener("change", () => (legendImg.hidden = !legendCb.checked || !frames.length));
arrowsCb.addEventListener("change", drawArrows);
window.addEventListener("resize", () => {
  if (frames.length) drawArrows();
});
document.querySelector("#export")!.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (frames[current]?.name ?? "flow") + ".png";
    a.click();
  });
});

// keyboard scrubbing
window.addEventListener("keydown", (e) => {
  if (!frames.length) return;
  if (e.key === "ArrowRight") loadFrame((current + 1) % frames.length);
  if (e.key === "ArrowLeft") loadFrame((current - 1 + frames.length) % frames.length);
});

// theme toggle
const themeBtn = document.querySelector<HTMLButtonElement>("#theme")!;
themeBtn.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});

// drag & drop
["dragover", "dragenter"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("hover");
  }),
);
["dragleave", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("hover");
  }),
);
window.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
});
document.querySelector<HTMLInputElement>("#file")!.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files) handleFiles(input.files);
});
legendCb.dispatchEvent(new Event("change"));

// --- Learn panel ---
document.querySelector("#learn-btn")!.addEventListener("click", () => openLearn());
document.querySelector("#learn-link")!.addEventListener("click", () => openLearn());
initLearnFromHash();
