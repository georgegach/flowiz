import "./style.css";
import { FlowRenderer, type Mode } from "./render";
import { parseByName, maxMagnitude, type FlowField } from "./flow";
import { uvToColor } from "./colorwheel";
import { EXAMPLES } from "./examples";
import { openLearn, initLearnFromHash } from "./learn";
import { setupExportMenu } from "./ui/export-menu";
import { setupConvertPanel, type ConvertPanel } from "./ui/convert-panel";
import { openGeneratePanel } from "./ui/generate-panel";
import { toast } from "./ui/toast";
import { isModalOpen } from "./ui/modal";
import { FlowJobManager } from "./flowgen/job-manager";
import { createStatusChip } from "./ui/status-chip";
import { setupFilmstrip } from "./ui/filmstrip";

const VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i;

const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
const THEME_SVG = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg><svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><strong>flowiz</strong></div>
    <nav aria-label="Primary">
      <button id="learn-btn" class="learn-trigger">Learn</button>
      <a href="./docs/" target="_blank" rel="noopener">Docs</a>
      <a href="https://github.com/georgegach/flowiz" target="_blank" rel="noopener">GitHub</a>
      <button id="theme" title="Toggle theme" aria-label="Toggle theme">${THEME_SVG}</button>
    </nav>
  </header>

  <main>
    <div class="viewer-col">
    <section id="stage" class="stage">
      <div id="drop" class="dropzone">
        <div class="drop-inner">
          <div class="drop-illo" aria-hidden="true">
            <svg viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="12" y="16" width="66" height="46" rx="6" stroke="currentColor" stroke-width="2.5"/>
              <rect x="30" y="26" width="66" height="46" rx="6" fill="var(--panel)" stroke="currentColor" stroke-width="2.5"/>
              <g stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M44 56c5-11 24-12 34-5"/>
                <path d="M72 45l7 6-9 3"/>
              </g>
            </svg>
          </div>
          <h1 class="drop-title">Visualize optical flow in your browser</h1>
          <p class="drop-sub">Drop files anywhere — everything runs locally, nothing is uploaded.</p>
          <div class="drop-paths">
            <div class="drop-path">
              <h2>View flow files</h2>
              <p>.flo · KITTI .png · .pfm · .npy</p>
              <label class="pick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v5h5M14 3l6 6v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>Choose files<input id="file" type="file" multiple accept=".flo,.png,.pfm,.npy" hidden /></label>
            </div>
            <div class="drop-path">
              <h2>Generate from video</h2>
              <p>.mp4 · .webm · .mov — computed on-device</p>
              <label class="pick pick-alt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 10l4-2v8l-4-2"/></svg>Choose video<input id="video-file" type="file" accept="video/*,.mkv,.avi,.m4v,.ogv" hidden /></label>
            </div>
          </div>
          <div class="examples">
            <span class="ex-label">or try an example</span>
            <div id="examples" class="ex-buttons"></div>
          </div>
          <button id="learn-link" class="learn-hint">New to optical flow? Start here →</button>
        </div>
      </div>
      <canvas id="source" class="source" hidden></canvas>
      <canvas id="canvas" tabindex="0" aria-label="Flow visualization — click a pixel to pin its readout" hidden></canvas>
      <canvas id="arrows" class="arrows" hidden></canvas>
      <div id="peekdot" class="peekdot" hidden></div>
      <div id="inspector" class="inspector" hidden></div>
      <div id="stagebar" class="stagebar" hidden></div>
      <div id="loader" class="loader" hidden>
        <div class="loader-card">
          <div class="loader-title" id="loader-title">Loading files</div>
          <div class="loader-bar" id="loader-bar"><div id="loader-fill" class="loader-fill"></div></div>
          <div id="loader-meta" class="loader-meta"></div>
        </div>
      </div>
    </section>
      <div id="timeline" class="timeline" hidden>
        <button id="prevframe" class="framenav" aria-label="Previous frame"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <input id="frameslider" class="frameslider" type="range" min="0" max="0" value="0" step="1" aria-label="Frame timeline — slide to scrub frames" />
        <button id="nextframe" class="framenav" aria-label="Next frame"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      </div>
    </div>

    <aside id="controls" class="controls" hidden>
      <section class="ctl-group" id="legend-card" hidden>
        <h3 class="ctl-group-t">Color wheel</h3>
        <div class="legend-wrap">
          <img id="legend" class="legend" hidden alt="Color wheel legend — hover to isolate a direction, click to pin" tabindex="0" role="button" />
          <canvas id="legendarrow" class="legend-arrow" hidden></canvas>
        </div>
        <div id="hlradius-ctl" hidden>
          <label class="op-inline">Highlight radius <input id="hlradius" type="range" min="0.02" max="0.6" step="0.01" value="0.06" aria-label="Direction highlight radius" /></label>
        </div>
      </section>

      <section class="ctl-group">
        <h3 class="ctl-group-t">Encoding</h3>
        <div class="segmented" id="mode" role="group" aria-label="Encoding">
          <button data-mode="rgb" class="active" aria-pressed="true">Color</button>
          <button data-mode="uv" aria-pressed="false">UV</button>
          <button data-mode="mag" aria-pressed="false">Magnitude</button>
          <button data-mode="angle" aria-pressed="false">Angle</button>
        </div>
        <div class="maxflow-head"><label for="maxflow">Max flow</label><span id="maxval" class="val-chip"></span></div>
        <input id="maxflow" type="range" min="0.1" max="100" step="0.1" aria-label="Max flow (pixels)" />
      </section>

      <section class="ctl-group">
        <h3 class="ctl-group-t">Display</h3>
        <div class="ctl-toggles">
          <label><input id="mask" type="checkbox" checked /> Mask invalid</label>
          <label><input id="showlegend" type="checkbox" checked /> Show legend</label>
          <label><input id="showarrows" type="checkbox" /> Arrows</label>
        </div>
        <div class="ctl-toggles" id="source-ctl" hidden>
          <label><input id="showsource" type="checkbox" /> Source video</label>
          <label class="op-inline" id="flowop-row" hidden>Flow <input id="flowop" type="range" min="0" max="100" step="1" value="55" aria-label="Flow opacity over source video" /></label>
        </div>
      </section>

      <section class="ctl-group" id="playback" hidden>
        <h3 class="ctl-group-t">Playback</h3>
        <div class="play-row">
          <button id="play" class="play-btn" title="Play / pause" aria-label="Play / pause">${PLAY_SVG}</button>
          <input id="fps" type="range" min="1" max="30" step="1" value="8" aria-label="Playback speed (frames per second)" />
          <span id="fpsval" class="fps-val">8 fps</span>
        </div>
      </section>

      <details class="ctl-group ctl-details" id="io-group" open>
        <summary>Convert &amp; export</summary>
        <div class="ctl-details-body">
          <div class="ctl" id="convert-ctl"></div>
          <div class="ctl" id="export-ctl"></div>
        </div>
      </details>

      <section class="ctl-group">
        <h3 class="ctl-group-t">Frame info</h3>
        <div id="stats" class="stats"></div>
      </section>

      <div id="filmstrip" class="filmstrip"></div>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const drop = document.querySelector<HTMLDivElement>("#drop")!;
const controls = document.querySelector<HTMLElement>("#controls")!;
const inspector = document.querySelector<HTMLDivElement>("#inspector")!;
const legendImg = document.querySelector<HTMLImageElement>("#legend")!;
const legendArrow = document.querySelector<HTMLCanvasElement>("#legendarrow")!;
const legendCard = document.querySelector<HTMLElement>("#legend-card")!;
const loaderEl = document.querySelector<HTMLDivElement>("#loader")!;
const loaderFill = document.querySelector<HTMLDivElement>("#loader-fill")!;
const loaderMeta = document.querySelector<HTMLDivElement>("#loader-meta")!;
const loaderBar = document.querySelector<HTMLDivElement>("#loader-bar")!;
const loaderTitle = document.querySelector<HTMLDivElement>("#loader-title")!;
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
const stageEl = document.querySelector<HTMLElement>("#stage")!;
const stagebar = document.querySelector<HTMLDivElement>("#stagebar")!;
const peekDot = document.querySelector<HTMLDivElement>("#peekdot")!;
const prevBtn = document.querySelector<HTMLButtonElement>("#prevframe")!;
const nextBtn = document.querySelector<HTMLButtonElement>("#nextframe")!;
const timelineEl = document.querySelector<HTMLDivElement>("#timeline")!;
const frameSlider = document.querySelector<HTMLInputElement>("#frameslider")!;
const arrowsCanvas = document.querySelector<HTMLCanvasElement>("#arrows")!;
const arrowsCb = document.querySelector<HTMLInputElement>("#showarrows")!;
const sourceCanvas = document.querySelector<HTMLCanvasElement>("#source")!;
const sourceCtl = document.querySelector<HTMLDivElement>("#source-ctl")!;
const showSourceCb = document.querySelector<HTMLInputElement>("#showsource")!;
const flowOpRow = document.querySelector<HTMLLabelElement>("#flowop-row")!;
const flowOp = document.querySelector<HTMLInputElement>("#flowop")!;
const hlRadiusInput = document.querySelector<HTMLInputElement>("#hlradius")!;
const hlRadiusCtl = document.querySelector<HTMLDivElement>("#hlradius-ctl")!;

let renderer: FlowRenderer | null = null;
let convertPanel: ConvertPanel | null = null;
let frames: FlowField[] = [];
let sourceFrames: (ImageBitmap | null)[] = []; // real video frames, aligned to `frames`
let current = 0;
let mode: Mode = "rgb";
let playTimer: number | null = null;

let highlight: { u: number; v: number; radius: number } | null = null;

function draw() {
  if (!renderer || !frames[current]) return;
  renderer.render({
    maxFlow: parseFloat(maxflow.value),
    mode,
    maskInvalid: maskCb.checked,
    highlight,
  });
  updateStats();
  drawArrows();
  drawSource();
  if (inspectorPin) renderInspector(inspectorPin.fx, inspectorPin.fy, inspectorPin.left, inspectorPin.top);
}

// Draw the real video frame directly behind the flow, sized/positioned to
// exactly overlay the flow canvas, and dim the flow so the footage shows
// through. Toggled by "Source video"; only available for video-generated flows.
function drawSource() {
  const bmp = sourceFrames[current];
  const on = showSourceCb.checked && !canvas.hidden && !!bmp;
  if (!on) {
    sourceCanvas.hidden = true;
    canvas.style.opacity = "1";
    return;
  }
  const cr = canvas.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  const cssW = cr.width;
  const cssH = cr.height;
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  sourceCanvas.hidden = false;
  sourceCanvas.width = Math.round(cssW * ratio);
  sourceCanvas.height = Math.round(cssH * ratio);
  sourceCanvas.style.width = `${cssW}px`;
  sourceCanvas.style.height = `${cssH}px`;
  sourceCanvas.style.left = `${cr.left - sr.left}px`;
  sourceCanvas.style.top = `${cr.top - sr.top}px`;
  const ctx = sourceCanvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(bmp!, 0, 0, cssW, cssH);
  canvas.style.opacity = String((parseFloat(flowOp.value) || 0) / 100);
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

// Draw an arrow on the legend wheel from center to a normalized (u,v) point.
// When selRadius (normalized, wheel radius = 1) is given, the wheel outside
// the selection disk around (nu, nv) is muted to mirror the image highlight.
function drawLegendArrow(nu: number, nv: number, selRadius?: number) {
  if (legendImg.hidden) {
    legendArrow.hidden = true;
    return;
  }
  const css = legendImg.clientWidth || 140;
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  const bw = Math.round(css * ratio);
  // Only reallocate the backing store when the size actually changed —
  // resizing a canvas clears it and causes flicker on every mousemove.
  if (legendArrow.width !== bw || legendArrow.height !== bw) {
    legendArrow.width = bw;
    legendArrow.height = bw;
    legendArrow.style.width = `${css}px`;
    legendArrow.style.height = `${css}px`;
  }
  legendArrow.hidden = false;
  const ctx = legendArrow.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, css, css);

  const r = css / 2;
  const rad = Math.hypot(nu, nv);
  const s = rad > 1 ? 1 / rad : 1; // clamp onto the wheel
  const x1 = r + nu * s * r;
  const y1 = r + nv * s * r;

  if (selRadius !== undefined) {
    const selPx = selRadius * r;
    // Everything (veil + ring) stays inside the wheel disk; inset the clip
    // slightly so strokes never poke past the anti-aliased wheel rim.
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 0.75, 0, Math.PI * 2);
    ctx.clip();
    // Mute outside the selection: radial gradient feathers the disk edge,
    // mirroring the shader's smoothstep falloff.
    const feather = Math.max(2, selPx * 0.15);
    const g = ctx.createRadialGradient(
      x1, y1, Math.max(0, selPx - feather / 2),
      x1, y1, selPx + feather / 2,
    );
    g.addColorStop(0, "rgba(128,128,128,0)");
    g.addColorStop(1, "rgba(128,128,128,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, css, css);
    // Ring marking the selection radius.
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x1, y1, selPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x1, y1, selPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const a = Math.atan2(y1 - r, x1 - r);
  const head = 5;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a + 0.5), y1 - head * Math.sin(a + 0.5));
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  trace();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 1.6;
  trace();
  ctx.stroke();
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
  strip.setCurrent(current);
  convertPanel?.update();
}

function updateTimeline() {
  const multi = frames.length > 1;
  timelineEl.hidden = !multi;
  if (multi) {
    if (frameSlider.max !== String(frames.length - 1)) frameSlider.max = String(frames.length - 1);
    // Setting .value to the current value is a no-op and fires no event, so this
    // stays in sync with keyboard/chevron scrubbing without feedback loops.
    frameSlider.value = String(current);
    frameSlider.style.setProperty("--fill", `${(current / (frames.length - 1)) * 100}%`);
  }
}

function updateStats() {
  const f = frames[current];
  if (!f) {
    stagebar.hidden = true;
    timelineEl.hidden = true;
    return;
  }
  const mx = maxMagnitude(f);
  statsEl.innerHTML = `
    <div><span>Frame</span><b>${current + 1} / ${frames.length}</b></div>
    <div><span>Size</span><b>${f.width}×${f.height}</b></div>
    <div><span>Max |flow|</span><b>${mx.toFixed(3)} px</b></div>
    <div><span>File</span><b class="fname">${f.name}</b></div>`;
  stagebar.textContent = `${f.name} · ${current + 1}/${frames.length}`;
  stagebar.hidden = false;
  updateTimeline();
}

function gotoFrame(delta: number) {
  if (frames.length < 2) return;
  loadFrame((current + delta + frames.length) % frames.length);
}
prevBtn.addEventListener("click", () => gotoFrame(-1));
nextBtn.addEventListener("click", () => gotoFrame(1));
frameSlider.addEventListener("input", () => {
  const i = parseInt(frameSlider.value, 10);
  if (Number.isFinite(i) && i !== current && i >= 0 && i < frames.length) loadFrame(i);
});

const strip = setupFilmstrip(filmstrip, (i) => loadFrame(i));

function setLoader(done: number, total: number, name?: string) {
  loaderFill.style.width = `${Math.round((done / total) * 100)}%`;
  loaderMeta.textContent = `${done} / ${total}${name ? ` · ${name}` : ""}`;
}

async function handleFiles(fileList: FileList | File[]) {
  const all = Array.from(fileList);
  const videos = all.filter((f) => f.type.startsWith("video/") || VIDEO_RE.test(f.name));
  if (videos.length) {
    // One settings dialog configures every dropped video; they queue and stream
    // into the viewer one after another in the background.
    openGeneratePanel(videos, {
      enqueue: (fs, settings) => fs.forEach((f) => jobManager.enqueue(f, settings)),
      notify: showError,
    });
    if (all.length > videos.length) {
      showError("Flow files ignored — generating from the dropped video(s).", "info");
    }
    return;
  }
  const files = all;
  const total = files.length;
  const parsed: FlowField[] = [];
  const single = total === 1;
  // Multi-file loads get a determinate bar; a single file shows an indeterminate
  // sweep so a large parse doesn't sit with no feedback. Reveal is delayed so a
  // tiny file never flashes the overlay.
  loaderTitle.textContent = "Loading files";
  loaderBar.classList.toggle("indeterminate", single);
  if (single) {
    loaderFill.style.width = "40%";
    loaderMeta.textContent = files[0].name;
  } else {
    setLoader(0, total);
  }
  const reveal = window.setTimeout(() => {
    loaderEl.hidden = false;
  }, single ? 150 : 0);
  try {
    for (let i = 0; i < total; i++) {
      const file = files[i];
      if (!single) setLoader(i, total, file.name); // "about to load" i-th
      try {
        // arrayBuffer() awaits, letting the browser paint the bar between files
        const buf = await file.arrayBuffer();
        parsed.push(parseByName(buf, file.name));
      } catch (e) {
        showError((e as Error).message);
      }
      if (!single) setLoader(i + 1, total, file.name);
    }
  } finally {
    clearTimeout(reveal);
    loaderBar.classList.remove("indeterminate");
    loaderEl.hidden = true;
  }
  if (!parsed.length) return;
  showFrames(parsed);
}

function showFrames(parsed: FlowField[], source?: (ImageBitmap | null)[]) {
  stopPlayback();
  // Sort flows by name; carry the matching source frame with each so the two
  // stay aligned after sorting.
  const order = parsed
    .map((f, i) => ({ f, s: source?.[i] ?? null }))
    .sort((a, b) => a.f.name.localeCompare(b.f.name, undefined, { numeric: true }));
  frames = order.map((o) => o.f);
  for (const b of sourceFrames) b?.close?.();
  sourceFrames = source ? order.map((o) => o.s) : [];
  const hasSource = sourceFrames.some(Boolean);
  sourceCtl.hidden = !hasSource;
  flowOpRow.hidden = !hasSource || !showSourceCb.checked;
  drop.hidden = true;
  canvas.hidden = false;
  controls.hidden = false;
  playbackSection.hidden = frames.length < 2;
  strip.setFrames(frames);
  loadFrame(0);
  renderLegend();
  setLegendVisible(legendCb.checked);
}

// --- background generation: frames stream in one at a time ---
// Reset the viewer for a new generation job (fired just before its first frame,
// so a job that dies while downloading never blanks the current results).
function beginStream() {
  stopPlayback();
  for (const b of sourceFrames) b?.close?.();
  frames = [];
  sourceFrames = [];
  current = 0;
  strip.setFrames([]);
  stagebar.hidden = true;
  drop.hidden = true;
  sourceCtl.hidden = true;
  playbackSection.hidden = true;
}

// Append one freshly computed frame. Never routes through showFrames (which
// sorts + replaces + closes prior bitmaps); auto-range stays per-frame.
function appendFrame(flow: FlowField, src: ImageBitmap | null) {
  frames.push(flow);
  sourceFrames.push(src);
  strip.appendFrame(flow);
  playbackSection.hidden = frames.length < 2;
  const hasSource = sourceFrames.some(Boolean);
  sourceCtl.hidden = !hasSource;
  flowOpRow.hidden = !hasSource || !showSourceCb.checked;
  if (frames.length === 1) {
    canvas.hidden = false;
    controls.hidden = false;
    loadFrame(0);
    renderLegend();
    setLegendVisible(legendCb.checked);
  } else {
    // Never jump to a newly generated frame — leave the user on whatever frame
    // they're inspecting; only refresh the frame count + strip highlight.
    updateStats();
    strip.setCurrent(current);
  }
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

function showError(msg: string, kind: "error" | "info" = "error") {
  toast(msg, kind);
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

// Show/hide the in-panel color-wheel card (opt-in via the checkbox), keeping
// legendImg.hidden as the source of truth the hover/pin code reads. The wheel is
// a static reference — show it whenever the toggle is on, even before a flow is
// loaded, so it's populated as soon as the page loads (not a blank card).
function setLegendVisible(on: boolean) {
  legendImg.hidden = !on;
  legendCard.hidden = !on;
  hlRadiusCtl.hidden = !on;
  if (!on) unpinLegend();
}

// The color-wheel legend (opt-in via the checkbox), rendered in the sidebar.
function renderLegend() {
  const css = 140;
  const px = backingSize(css);
  const c = document.createElement("canvas");
  c.width = c.height = px;
  paintWheel(c.getContext("2d")!, px).then(() => {
    legendImg.src = c.toDataURL();
  });
}

// --- inspector: per-pixel readout on hover; click to pin ---
// Pinned readout persists after the cursor leaves and re-renders as frames
// change. left/top are stage-relative CSS px (the box is stage-absolute, so
// positioning from the stage rect — not the canvas rect — keeps it aligned).
let inspectorPin: { fx: number; fy: number; left: number; top: number } | null = null;

function renderInspector(fx: number, fy: number, left: number, top: number) {
  const f = frames[current];
  if (!f || fx < 0 || fy < 0 || fx >= f.width || fy >= f.height) {
    inspector.hidden = true;
    return;
  }
  const i = (fy * f.width + fx) * 2;
  const u = f.data[i];
  const v = f.data[i + 1];
  inspector.hidden = false;
  inspector.style.left = `${left}px`;
  inspector.style.top = `${top}px`;
  inspector.innerHTML = `
    ${inspectorPin ? '<div class="ins-pin">pinned · click to release</div>' : ""}
    <div>x,y <b>${fx},${fy}</b></div>
    <div>u <b>${u.toFixed(3)}</b></div>
    <div>v <b>${v.toFixed(3)}</b></div>
    <div>|·| <b>${Math.hypot(u, v).toFixed(3)}</b></div>
    <div>∠ <b>${((Math.atan2(v, u) * 180) / Math.PI).toFixed(1)}°</b></div>`;
  const mf = parseFloat(maxflow.value) || maxMagnitude(f) || 1;
  drawLegendArrow(u / mf, v / mf);
}

function pixelAt(e: MouseEvent, f: FlowField) {
  const rect = canvas.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  return {
    fx: Math.floor(((e.clientX - rect.left) / rect.width) * f.width),
    fy: Math.floor(((e.clientY - rect.top) / rect.height) * f.height),
    left: e.clientX - sr.left + 14,
    top: e.clientY - sr.top + 14,
  };
}

function unpinInspector() {
  inspectorPin = null;
  inspector.hidden = true;
  legendArrow.hidden = true;
}

canvas.addEventListener("mousemove", (e) => {
  if (inspectorPin) return; // frozen on the pinned pixel
  const f = frames[current];
  if (!f) return;
  const p = pixelAt(e, f);
  renderInspector(p.fx, p.fy, p.left, p.top);
});
canvas.addEventListener("mouseleave", () => {
  if (inspectorPin) return;
  inspector.hidden = true;
  legendArrow.hidden = true;
});
canvas.addEventListener("click", (e) => {
  const f = frames[current];
  if (!f) return;
  if (inspectorPin) {
    unpinInspector();
    return;
  }
  const p = pixelAt(e, f);
  if (p.fx < 0 || p.fy < 0 || p.fx >= f.width || p.fy >= f.height) return;
  inspectorPin = p;
  renderInspector(p.fx, p.fy, p.left, p.top);
});

// --- touch: pixel peeker (dot above the finger, readout above the dot, clamped
// to the stage) + horizontal-flick swipe to change frames ---
const PEEK_OFFSET = 54; // px the sample point sits above the fingertip

function showTouchPeek(clientX: number, clientY: number) {
  const f = frames[current];
  if (!f) {
    hideTouchPeek();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const sr = stageEl.getBoundingClientRect();
  const peekX = clientX;
  const peekY = clientY - PEEK_OFFSET;
  const fx = Math.max(0, Math.min(f.width - 1, Math.floor(((peekX - rect.left) / rect.width) * f.width)));
  const fy = Math.max(0, Math.min(f.height - 1, Math.floor(((peekY - rect.top) / rect.height) * f.height)));
  const i = (fy * f.width + fx) * 2;
  const u = f.data[i];
  const v = f.data[i + 1];

  const mf = parseFloat(maxflow.value) || maxMagnitude(f) || 1;
  const [cr, cg, cb] = uvToColor(u / mf, v / mf);

  const dotLeft = peekX - sr.left;
  const dotTop = peekY - sr.top;
  peekDot.style.left = `${dotLeft}px`;
  peekDot.style.top = `${dotTop}px`;
  peekDot.style.background = `rgb(${cr}, ${cg}, ${cb})`; // the color being peeked
  peekDot.hidden = false;

  inspector.hidden = false;
  inspector.innerHTML = `
    <div>x,y <b>${fx},${fy}</b></div>
    <div>u <b>${u.toFixed(3)}</b></div>
    <div>v <b>${v.toFixed(3)}</b></div>
    <div>|·| <b>${Math.hypot(u, v).toFixed(3)}</b></div>
    <div>∠ <b>${((Math.atan2(v, u) * 180) / Math.PI).toFixed(1)}°</b></div>`;
  const iw = inspector.offsetWidth;
  const ih = inspector.offsetHeight;
  const left = Math.max(6, Math.min(sr.width - iw - 6, dotLeft - iw / 2));
  const top = Math.max(6, dotTop - ih - 14);
  inspector.style.left = `${left}px`;
  inspector.style.top = `${top}px`;

  drawLegendArrow(u / mf, v / mf);
}

function hideTouchPeek() {
  peekDot.hidden = true;
  inspector.hidden = true;
  legendArrow.hidden = true;
}

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!frames.length) return;
    const t = e.touches[0];
    showTouchPeek(t.clientX, t.clientY);
    e.preventDefault(); // no scroll, and suppress the synthetic mouse events
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!frames.length) return;
    const t = e.touches[0];
    showTouchPeek(t.clientX, t.clientY);
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener("touchend", hideTouchPeek);
canvas.addEventListener("touchcancel", hideTouchPeek);

// --- legend hover: isolate the hovered direction/speed in the flow image ---
let hlRadius = 0.06; // selection radius in normalized units (wheel radius = 1)
let legendPinned = false; // click-to-pin keeps the isolation after the cursor leaves

function unpinLegend() {
  legendPinned = false;
  legendImg.classList.remove("pinned");
  legendArrow.hidden = true;
  if (highlight) {
    highlight = null;
    draw();
  }
}

function updateLegendHover(clientX: number, clientY: number) {
  const rect = legendImg.getBoundingClientRect();
  const r = rect.width / 2;
  const tu = (clientX - rect.left - r) / r;
  const tv = (clientY - rect.top - r) / r;
  if (Math.hypot(tu, tv) > 1) {
    // outside the wheel disk — no target
    legendArrow.hidden = true;
    if (highlight) {
      highlight = null;
      draw();
    }
    return;
  }
  highlight = { u: tu, v: tv, radius: hlRadius };
  drawLegendArrow(tu, tv, hlRadius); // arrow + selection ring, rest muted
  draw();
}

legendImg.addEventListener("mousemove", (e) => updateLegendHover(e.clientX, e.clientY));
// Touch: drag on the wheel isolates that direction (persists after lifting). The
// target sits above the fingertip by the SAME distance as the image pixel-peeker
// (PEEK_OFFSET) so the finger doesn't cover it — touch-only (the mouse is exact).
const legendTouch = (e: TouchEvent) => {
  const t = e.touches[0];
  if (!t) return;
  legendPinned = true;
  legendImg.classList.add("pinned");
  updateLegendHover(t.clientX, t.clientY - PEEK_OFFSET);
  e.preventDefault();
};
legendImg.addEventListener("touchstart", legendTouch, { passive: false });
legendImg.addEventListener("touchmove", legendTouch, { passive: false });
legendImg.addEventListener("click", () => {
  legendPinned = !legendPinned;
  legendImg.classList.toggle("pinned", legendPinned);
});
legendImg.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    legendPinned = !legendPinned;
    legendImg.classList.toggle("pinned", legendPinned);
  }
});
legendImg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault(); // keep the page from scrolling while resizing
    // Exponential scaling proportional to the wheel delta — smooth on
    // trackpads (many small deltas) and stepped on notched mouse wheels.
    hlRadius = Math.min(1.5, Math.max(0.02, hlRadius * Math.exp(-e.deltaY * 0.005)));
    syncHlRadiusInput();
    updateLegendHover(e.clientX, e.clientY);
  },
  { passive: false },
);
legendImg.addEventListener("mouseleave", () => {
  if (legendPinned) return; // keep the isolation while pinned
  legendArrow.hidden = true;
  if (highlight) {
    highlight = null;
    draw();
  }
});

// Highlight-radius slider — the keyboard/touch equivalent of the wheel-resize.
function syncHlRadiusInput() {
  hlRadiusInput.value = String(Math.min(0.6, Math.max(0.02, hlRadius)));
}
hlRadiusInput.addEventListener("input", () => {
  hlRadius = parseFloat(hlRadiusInput.value);
  if (highlight) {
    highlight = { ...highlight, radius: hlRadius };
    drawLegendArrow(highlight.u, highlight.v, hlRadius);
    draw();
  }
});

// --- controls wiring ---
document.querySelector("#mode")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  mode = btn.dataset.mode as Mode;
  document.querySelectorAll("#mode button").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  draw();
});
maxflow.addEventListener("input", () => {
  maxval.textContent = parseFloat(maxflow.value).toFixed(2);
  draw();
});
maskCb.addEventListener("change", draw);
legendCb.addEventListener("change", () => setLegendVisible(legendCb.checked));
arrowsCb.addEventListener("change", drawArrows);
showSourceCb.addEventListener("change", () => {
  flowOpRow.hidden = !showSourceCb.checked || sourceCtl.hidden;
  drawSource();
});
flowOp.addEventListener("input", drawSource);
window.addEventListener("resize", () => {
  if (frames.length) {
    drawArrows();
    drawSource();
  }
});
convertPanel = setupConvertPanel(document.querySelector<HTMLDivElement>("#convert-ctl")!, {
  getFrames: () => frames,
  getCurrent: () => current,
  notify: showError,
});
setupExportMenu(document.querySelector<HTMLDivElement>("#export-ctl")!, {
  getFrames: () => frames,
  getCurrent: () => current,
  getFps: () => parseInt(fpsInput.value, 10),
  canvas,
  notify: showError,
});

// Persist the Convert & export collapsible open/closed state.
const ioGroup = document.querySelector<HTMLDetailsElement>("#io-group")!;
try {
  if (localStorage.getItem("flowiz.panel.io") === "0") ioGroup.open = false;
} catch {
  /* private mode */
}
ioGroup.addEventListener("toggle", () => {
  try {
    localStorage.setItem("flowiz.panel.io", ioGroup.open ? "1" : "0");
  } catch {
    /* private mode */
  }
});

// --- background flow generation: status chip + job manager ---
let jobManager!: FlowJobManager;
const statusChip = createStatusChip({
  stop: (id) => jobManager.stop(id),
  cancel: (id) => jobManager.cancel(id),
});
// Floats just under the topbar (CSS positions it) rather than crowding the nav.
document.body.appendChild(statusChip.el);
jobManager = new FlowJobManager({
  onStreamStart: () => beginStream(),
  onFrame: (_job, flow, src) => appendFrame(flow, src),
  onStreamEnd: () => {},
  onJobUpdate: (active, queue) => statusChip.update(active, queue),
  onProgress: (job, phase, done, total, kind) => statusChip.progress(job, phase, done, total, kind),
  notify: showError,
});

// keyboard scrubbing — suspended while a modal is open, and ignored when a form
// control is focused (so arrows on a slider adjust it instead of scrubbing).
window.addEventListener("keydown", (e) => {
  if (isModalOpen()) return;
  if (e.key === "Escape") {
    let acted = false;
    if (legendPinned) {
      unpinLegend();
      acted = true;
    }
    if (inspectorPin) {
      unpinInspector();
      acted = true;
    }
    if (acted) return;
  }
  if (!frames.length) return;
  const t = e.target as HTMLElement | null;
  if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  if (e.key === "ArrowRight") loadFrame((current + 1) % frames.length);
  if (e.key === "ArrowLeft") loadFrame((current - 1 + frames.length) % frames.length);
});

// theme toggle — persists the explicit choice; follows the OS until one is made
const themeBtn = document.querySelector<HTMLButtonElement>("#theme")!;
themeBtn.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("flowiz.theme", dark ? "dark" : "light");
  } catch {
    /* private mode */
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("flowiz.theme");
  } catch {
    /* private mode */
  }
  if (stored) return; // an explicit choice wins over the system preference
  document.documentElement.classList.toggle("dark", e.matches);
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
document.querySelector<HTMLInputElement>("#video-file")!.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files) handleFiles(input.files);
});
// Pre-render the color wheel at startup so it's fully loaded and appears the
// instant the panel opens (no lazy paint gap on the first flow). It's static and
// frame-independent, so one paint at boot is enough.
renderLegend();
legendCb.dispatchEvent(new Event("change"));

// --- Learn panel ---
document.querySelector("#learn-btn")!.addEventListener("click", () => openLearn());
document.querySelector("#learn-link")!.addEventListener("click", () => openLearn());
initLearnFromHash();
