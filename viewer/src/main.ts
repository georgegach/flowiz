import "./style.css";
import { FlowRenderer, type Mode } from "./render";
import { parseByName, maxMagnitude, type FlowField } from "./flow";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand">🌀 <strong>flowiz</strong> <span class="ver">viewer</span></div>
    <nav>
      <a href="./docs/" target="_blank" rel="noopener">Docs</a>
      <a href="https://github.com/georgegach/flowiz" target="_blank" rel="noopener">GitHub</a>
      <button id="theme" title="Toggle theme">◐</button>
    </nav>
  </header>

  <main>
    <section id="stage" class="stage">
      <div id="drop" class="dropzone">
        <div class="drop-inner">
          <div class="big">Drop optical flow files here</div>
          <div class="sub">.flo · KITTI .png · .pfm · .npy — everything stays on your machine</div>
          <label class="pick">Choose files<input id="file" type="file" multiple accept=".flo,.png,.pfm,.npy" hidden /></label>
        </div>
      </div>
      <canvas id="canvas" hidden></canvas>
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
        <label>Max flow <span id="maxval"></span></label>
        <input id="maxflow" type="range" min="0.1" max="100" step="0.1" />
      </div>
      <div class="ctl row">
        <label><input id="mask" type="checkbox" checked /> Mask invalid</label>
        <label><input id="showlegend" type="checkbox" checked /> Legend</label>
      </div>
      <div class="ctl">
        <button id="export" class="primary">Export PNG</button>
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

let renderer: FlowRenderer | null = null;
let frames: FlowField[] = [];
let current = 0;
let mode: Mode = "rgb";

function draw() {
  if (!renderer || !frames[current]) return;
  renderer.render({
    maxFlow: parseFloat(maxflow.value),
    mode,
    maskInvalid: maskCb.checked,
  });
  updateStats();
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
  frames = parsed.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  drop.hidden = true;
  canvas.hidden = false;
  controls.hidden = false;
  buildFilmstrip();
  loadFrame(0);
  renderLegend();
}

function showError(msg: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// --- color wheel legend (drawn once on a small canvas) ---
function renderLegend() {
  const size = 96;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  // reuse the CPU reference for an exact legend
  import("./colorwheel").then(({ uvToColor }) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x - size / 2) / (size / 2);
        const v = (y - size / 2) / (size / 2);
        const idx = (y * size + x) * 4;
        if (Math.hypot(u, v) <= 1) {
          const [r, g, b] = uvToColor(u, v);
          img.data[idx] = r;
          img.data[idx + 1] = g;
          img.data[idx + 2] = b;
          img.data[idx + 3] = 255;
        } else {
          img.data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    legendImg.src = c.toDataURL();
  });
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
  document.documentElement.classList.toggle("light");
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
