/**
 * Live canvas/HTML diagrams for the Learn panel.
 *
 * Everything flow-colored reuses `uvToColor` from colorwheel.ts, so figures are
 * pixel-identical to the real renderer and to the Python library. Chrome (text,
 * axes, arrows) is drawn in a mid-gray that reads on both light and dark themes;
 * HTML-based figures use CSS variables and re-theme automatically.
 */

import { uvToColor } from "./colorwheel";

export interface FigureHandle {
  stop(): void;
}

const INK = "#8b93a7"; // --muted-ish; legible on light and dark
const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- small canvas helpers -------------------------------------------------

function dpr(): number {
  return Math.min(3, window.devicePixelRatio || 1);
}

/** A DPR-scaled canvas whose 2D context is in CSS-pixel coordinates. */
function makeCanvas(host: HTMLElement, w: number, h: number) {
  const ratio = dpr();
  const c = document.createElement("canvas");
  c.width = Math.round(w * ratio);
  c.height = Math.round(h * ratio);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.style.maxWidth = "100%";
  c.style.height = "auto";
  const ctx = c.getContext("2d")!;
  ctx.scale(ratio, ratio);
  host.appendChild(c);
  return { c, ctx };
}

type FieldFn = (x: number, y: number, cx: number, cy: number) => [number, number];

function synth(w: number, h: number, fn: FieldFn): Float32Array {
  const data = new Float32Array(w * h * 2);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = fn(x, y, cx, cy);
      const i = (y * w + x) * 2;
      data[i] = u;
      data[i + 1] = v;
    }
  return data;
}

function maxMag(data: Float32Array): number {
  let mx = 0;
  for (let i = 0; i < data.length; i += 2) {
    const m = Math.hypot(data[i], data[i + 1]);
    if (m > mx) mx = m;
  }
  return mx || 1;
}

/** A 1px-per-flow-pixel canvas element colorized via the Middlebury wheel. */
function colorizeCanvas(w: number, h: number, data: Float32Array, max: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let p = 0; p < w * h; p++) {
    const [r, g, b] = uvToColor(data[p * 2] / max, data[p * 2 + 1] / max);
    img.data[p * 4] = r;
    img.data[p * 4 + 1] = g;
    img.data[p * 4 + 2] = b;
    img.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function labeledField(host: HTMLElement, caption: string, node: HTMLCanvasElement, cssW: number) {
  const fig = document.createElement("div");
  fig.className = "lf-cell";
  node.style.width = `${cssW}px`;
  node.style.height = "auto";
  node.style.imageRendering = "auto";
  node.className = "lf-img";
  const cap = document.createElement("div");
  cap.className = "lf-cap";
  cap.textContent = caption;
  fig.append(node, cap);
  host.appendChild(fig);
}

function paintWheelInto(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const px = Math.round(r * 2);
  const img = ctx.createImageData(px, px);
  const band = 1.5 / r;
  for (let y = 0; y < px; y++)
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
  // Render to an offscreen buffer then blit so DPR scaling of the parent applies.
  const off = document.createElement("canvas");
  off.width = px;
  off.height = px;
  off.getContext("2d")!.putImageData(img, 0, 0);
  ctx.drawImage(off, cx - r, cy - r, px, px);
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = 6;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

// --- individual figures ---------------------------------------------------

function cell(host: HTMLElement, caption: string, w: number, h: number) {
  const wrap = document.createElement("div");
  wrap.className = "lf-cell";
  host.appendChild(wrap);
  const { ctx } = makeCanvas(wrap, w, h);
  const cap = document.createElement("div");
  cap.className = "lf-cap";
  cap.textContent = caption;
  wrap.appendChild(cap);
  return ctx;
}

function figHeroTriptych(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-row";
  const W = 90,
    H = 70;
  const data = synth(W, H, () => [7, -3]); // uniform translation
  const max = maxMag(data);
  // (1) two-frame scene
  const ctx = cell(host, "two frames", 150, 116);
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 60, 40, 34);
  ctx.globalAlpha = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "#e0663a";
  ctx.strokeRect(58, 46, 40, 34);
  ctx.setLineDash([]);
  arrow(ctx, 60, 77, 78, 63, "#e0663a", 2);
  // (2) quiver
  const q = cell(host, "displacements", 150, 116);
  for (let gy = 0; gy < 5; gy++)
    for (let gx = 0; gx < 6; gx++) {
      const px = 18 + gx * 22;
      const py = 14 + gy * 22;
      arrow(q, px, py, px + 12, py - 5, INK, 1.4);
    }
  // (3) colorized
  labeledField(host, "color", colorizeCanvas(W, H, data, max), 150);
  return { stop() {} };
}

function figReadWheel(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const S = 260;
  const { ctx } = makeCanvas(host, S, S);
  const cx = S / 2,
    cy = S / 2,
    r = S / 2 - 34;
  paintWheelInto(ctx, cx, cy, r);
  ctx.fillStyle = INK;
  ctx.font = "600 13px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("↑ up", cx, cy - r - 16);
  ctx.fillText("↓ down", cx, cy + r + 16);
  ctx.fillText("left ←", cx - r - 24, cy);
  ctx.fillText("→ right", cx + r + 24, cy);
  ctx.fillText("slow", cx, cy - 10);
  arrow(ctx, cx, cy + 6, cx, cy + r - 10, INK, 1.4);
  ctx.fillText("fast", cx + 22, cy + r - 16);
  return { stop() {} };
}

function figQuiver(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const W = 120,
    H = 84;
  const data = synth(W, H, (x, y, cx, cy) => [-(y - cy) / 8, (x - cx) / 8]);
  const max = maxMag(data);
  const disp = 420;
  const scale = disp / W;
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = `${disp}px`;
  wrap.style.maxWidth = "100%";
  host.appendChild(wrap);
  const bg = colorizeCanvas(W, H, data, max);
  bg.style.width = "100%";
  bg.style.height = "auto";
  bg.style.opacity = "0.4";
  bg.style.display = "block";
  bg.style.borderRadius = "8px";
  wrap.appendChild(bg);
  const { ctx } = makeCanvas(wrap, disp, Math.round(H * scale));
  const ov = ctx.canvas;
  ov.style.position = "absolute";
  ov.style.left = "0";
  ov.style.top = "0";
  ov.style.width = "100%";
  const step = 14;
  for (let y = step / 2; y < H; y += step)
    for (let x = step / 2; x < W; x += step) {
      const i = (Math.floor(y) * W + Math.floor(x)) * 2;
      const u = data[i],
        v = data[i + 1];
      const px = x * scale,
        py = y * scale;
      arrow(ctx, px, py, px + (u / max) * 18, py + (v / max) * 18, INK, 1.3);
    }
  return { stop() {} };
}

function animatedHandle(fn: (t: number) => void): FigureHandle {
  if (reduceMotion()) {
    fn(0.25);
    return { stop() {} };
  }
  let raf = 0;
  let start = -1;
  const loop = (ts: number) => {
    if (start < 0) start = ts;
    fn(((ts - start) / 1000) % 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}

function figAperture(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const S = 300;
  const { ctx } = makeCanvas(host, S, 200);
  const cx = S / 2,
    cy = 100,
    r = 70;
  return animatedHandle((t) => {
    ctx.clearRect(0, 0, S, 200);
    // clip to aperture
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // a diagonal edge drifting right+down
    const off = (Math.sin(t * 2 * Math.PI) * r) / 1.5;
    ctx.fillStyle = "#4b78d8";
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - r - 40 + off, cy - r - 40);
    ctx.lineTo(cx + r + 40 + off, cy + r + 40 - 140);
    ctx.lineTo(cx + r + 200 + off, cy + r + 40);
    ctx.lineTo(cx - r + 200 + off, cy + r + 200);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // observed (normal) vs true motion arrows
    arrow(ctx, cx, cy, cx + 30, cy - 30, "#e0663a", 2.4); // normal component (observable)
    arrow(ctx, cx, cy, cx + 46, cy, "#2f9e6a", 2); // true motion (ambiguous along edge)
    ctx.fillStyle = INK;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("observed", cx + 34, cy - 34);
    ctx.fillText("true?", cx + 50, cy + 4);
  });
}

function figBrightness(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const W = 420,
    H = 180;
  const { ctx } = makeCanvas(host, W, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, H - 30);
  ctx.lineTo(W - 20, H - 30);
  ctx.stroke();
  const profile = (x: number, shift: number) => {
    const t = (x - 30 - shift) / (W - 60);
    return (H - 40) - 90 * Math.exp(-((t - 0.4) ** 2) / 0.01) * 1;
  };
  const drawCurve = (shift: number, color: string, dash: number[]) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 30; x < W - 20; x++) {
      const y = profile(x, shift);
      x === 30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  drawCurve(0, "#4b78d8", []);
  drawCurve(48, "#e0663a", [5, 4]);
  ctx.fillStyle = INK;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("I(x) at t", W - 150, 24);
  ctx.fillStyle = "#e0663a";
  ctx.fillText("I(x) at t+dt", W - 150, 42);
  ctx.fillStyle = INK;
  arrow(ctx, 190, 40, 238, 40, INK, 1.6);
  ctx.fillText("shift = u", 196, 30);
  return { stop() {} };
}

function figWheelAnatomy(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const S = 300;
  const { ctx } = makeCanvas(host, S, S);
  const cx = S / 2,
    cy = S / 2,
    r = S / 2 - 40;
  paintWheelInto(ctx, cx, cy, r);
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  const arcs = [
    ["R→Y", 15],
    ["Y→G", 6],
    ["G→C", 4],
    ["C→B", 11],
    ["B→M", 13],
    ["M→R", 6],
  ] as const;
  arcs.forEach(([lbl, n], i) => {
    const ang = ((i + 0.5) / 6) * Math.PI * 2 - Math.PI;
    const lx = cx + Math.cos(ang) * (r + 22);
    const ly = cy + Math.sin(ang) * (r + 22);
    ctx.fillText(`${lbl} (${n})`, lx, ly);
  });
  ctx.fillText("white = 0", cx, cy - 4);
  ctx.fillText("saturated = fast", cx, cy + r + 26);
  return { stop() {} };
}

function figArchetypes(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-grid2";
  const W = 90,
    H = 70;
  const cells: [string, FieldFn][] = [
    ["translation", () => [6, 0]],
    ["rotation", (x, y, cx, cy) => [-(y - cy) / 8, (x - cx) / 8]],
    ["zoom / expansion", (x, y, cx, cy) => [(x - cx) / 7, (y - cy) / 7]],
    ["motion boundary", (x, _y, cx) => [x < cx ? 6 : -6, 0]],
  ];
  for (const [cap, fn] of cells) {
    const data = synth(W, H, fn);
    labeledField(host, cap, colorizeCanvas(W, H, data, maxMag(data)), 170);
  }
  return { stop() {} };
}

function figNormFlicker(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-row";
  const W = 90,
    H = 70;
  // frames with a pulsing peak magnitude
  const frame = (k: number) =>
    synth(W, H, (x, y, cx, cy) => {
      const g = Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / 400));
      const speed = 6 + 6 * k;
      return [g * speed, g * speed * 0.2];
    });
  const globalMax = maxMag(frame(1));
  const cellA = document.createElement("div");
  const cellB = document.createElement("div");
  host.append(cellA, cellB);
  const perFrame = makeCanvas(cellA, 170, 132);
  const glob = makeCanvas(cellB, 170, 132);
  const capA = document.createElement("div");
  capA.className = "lf-cap";
  capA.textContent = "per-frame normalization → pulses";
  const capB = document.createElement("div");
  capB.className = "lf-cap";
  capB.textContent = "global normalization → steady";
  cellA.appendChild(capA);
  cellB.appendChild(capB);
  const blit = (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 170, 132);
    ctx.drawImage(src, 0, 0, 170, 132);
  };
  const render = (t: number) => {
    const k = (Math.sin(t * 2 * Math.PI) + 1) / 2;
    const data = frame(k);
    blit(perFrame.ctx, colorizeCanvas(W, H, data, maxMag(data)));
    blit(glob.ctx, colorizeCanvas(W, H, data, globalMax));
  };
  return animatedHandle(render);
}

function figEpe(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-row";
  const W = 90,
    H = 70;
  const gt = synth(W, H, (x, y, cx, cy) => [-(y - cy) / 8, (x - cx) / 8]);
  const pred = synth(W, H, (x, y, cx, cy) => [-(y - cy) / 8 + (x - cx) / 40, (x - cx) / 8]);
  const gmax = maxMag(gt);
  labeledField(host, "ground truth", colorizeCanvas(W, H, gt, gmax), 150);
  labeledField(host, "prediction", colorizeCanvas(W, H, pred, gmax), 150);
  // error heatmap (magma-ish ramp)
  const ec = document.createElement("canvas");
  ec.width = W;
  ec.height = H;
  const ectx = ec.getContext("2d")!;
  const eimg = ectx.createImageData(W, H);
  let emax = 0;
  const err = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const du = pred[p * 2] - gt[p * 2];
    const dv = pred[p * 2 + 1] - gt[p * 2 + 1];
    err[p] = Math.hypot(du, dv);
    if (err[p] > emax) emax = err[p];
  }
  for (let p = 0; p < W * H; p++) {
    const t = err[p] / (emax || 1);
    eimg.data[p * 4] = Math.round(255 * Math.min(1, t * 1.6));
    eimg.data[p * 4 + 1] = Math.round(255 * Math.max(0, t * 1.2 - 0.4));
    eimg.data[p * 4 + 2] = Math.round(255 * (0.3 + 0.4 * t));
    eimg.data[p * 4 + 3] = 255;
  }
  ectx.putImageData(eimg, 0, 0);
  labeledField(host, "EPE error map", ec, 150);
  return { stop() {} };
}

function figClosingWheel(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-center";
  const S = 220;
  const { ctx } = makeCanvas(host, S, S);
  paintWheelInto(ctx, S / 2, S / 2, S / 2 - 8);
  return { stop() {} };
}

// --- HTML-based figures (auto-theme via CSS variables) --------------------

function figTimeline(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-timeline";
  const items = [
    ["1950", "Gibson — optic flow"],
    ["1981", "Horn–Schunck & Lucas–Kanade"],
    ["2004", "Brox et al. — warping"],
    ["2010", "“Secrets” (Sun et al.)"],
    ["2015", "FlowNet — first CNN"],
    ["2018", "PWC-Net"],
    ["2020", "RAFT"],
    ["2022", "FlowFormer"],
    ["2024", "SEA-RAFT"],
  ];
  const ol = document.createElement("ol");
  ol.className = "lf-tl";
  for (const [yr, label] of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="lf-tl-year">${yr}</span><span class="lf-tl-label">${label}</span>`;
    ol.appendChild(li);
  }
  host.appendChild(ol);
  return { stop() {} };
}

function figFormatFamily(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-formats";
  const formats = [".flo", "KITTI .png", ".pfm", ".flo5", ".npy"];
  const left = document.createElement("div");
  left.className = "lf-fmt-list";
  left.innerHTML = formats.map((f) => `<span class="lf-chip">${f}</span>`).join("");
  const mid = document.createElement("div");
  mid.className = "lf-fmt-node";
  mid.textContent = "fz.read";
  const right = document.createElement("div");
  right.className = "lf-fmt-out";
  right.textContent = "one color image";
  host.append(left, document.createElement("div"), mid, document.createElement("div"), right);
  (host.children[1] as HTMLElement).className = "lf-arrow";
  (host.children[1] as HTMLElement).textContent = "→";
  (host.children[3] as HTMLElement).className = "lf-arrow";
  (host.children[3] as HTMLElement).textContent = "→";
  return { stop() {} };
}

/** Minimal 24×24 line icons; stroke = currentColor so they theme automatically. */
const ICONS: Record<string, string> = {
  compression: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18M3 14.5h18M8 5v14M16 5v14"/>',
  slowmo: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  editing: '<circle cx="6" cy="6.5" r="2.3"/><circle cx="6" cy="17.5" r="2.3"/><path d="M8 8l11 8.5M8 16L19 7.5"/>',
  driving: '<path d="M4 13l1.7-4.5A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.5L20 13v4h-2.5v-1.5h-11V17H4z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  slam: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z"/>',
  medical: '<path d="M12 19.5S4.5 15 4.5 9.8C4.5 7.4 6.2 6 8.2 6c1.6 0 2.9.9 3.8 2.3C12.9 6.9 14.2 6 15.8 6c2 0 3.7 1.4 3.7 3.8 0 5.2-7.5 9.7-7.5 9.7z"/>',
  weather: '<path d="M7.5 18h9a3.8 3.8 0 0 0 .4-7.6 4.8 4.8 0 0 0-9.2-1.2A3.4 3.4 0 0 0 7.5 18z"/>',
  fluid: '<path d="M3 8.5c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 14.5c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/>',
  biology: '<circle cx="9.5" cy="10" r="5"/><circle cx="9.5" cy="10" r="1.6"/><circle cx="16.5" cy="15.5" r="3.4"/><circle cx="16.5" cy="15.5" r="1"/>',
  action: '<circle cx="13.5" cy="5.5" r="2"/><path d="M13.5 8.5l-3 3.5 3 1.8 1 5.2M10.5 12l-3.5 1M14.5 13.8l3.2 1.2M10.5 20.5l2-3.5"/>',
};

function svgIcon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function figApplications(host: HTMLElement): FigureHandle {
  host.className = "learn-fig lf-apps";
  const apps: [string, string][] = [
    ["compression", "Video compression"],
    ["slowmo", "Slow-motion / interpolation"],
    ["editing", "Editing & VFX"],
    ["driving", "Autonomous driving"],
    ["slam", "Visual odometry / SLAM"],
    ["medical", "Medical imaging"],
    ["weather", "Weather (cloud winds)"],
    ["fluid", "Fluid dynamics (PIV)"],
    ["biology", "Biology / microscopy"],
    ["action", "Action recognition"],
  ];
  for (const [icon, label] of apps) {
    const card = document.createElement("div");
    card.className = "lf-app";
    card.innerHTML = `<div class="lf-app-i">${svgIcon(icon)}</div><div class="lf-app-l">${label}</div>`;
    host.appendChild(card);
  }
  return { stop() {} };
}

// --- registry -------------------------------------------------------------

const BUILDERS: Record<string, (host: HTMLElement) => FigureHandle> = {
  "hero-triptych": figHeroTriptych,
  "read-the-wheel": figReadWheel,
  "vector-field-quiver": figQuiver,
  "aperture-problem": figAperture,
  "history-timeline": figTimeline,
  "brightness-constancy": figBrightness,
  "color-wheel-anatomy": figWheelAnatomy,
  "motion-archetypes": figArchetypes,
  "normalization-flicker": figNormFlicker,
  "format-family": figFormatFamily,
  "epe-errormap": figEpe,
  "applications-grid": figApplications,
  "closing-wheel": figClosingWheel,
};

export function mountFigure(host: HTMLElement, id: string): FigureHandle | null {
  const b = BUILDERS[id];
  if (!b) return null;
  host.innerHTML = "";
  try {
    return b(host);
  } catch (e) {
    host.textContent = "";
    console.warn(`Learn figure "${id}" failed`, e);
    return null;
  }
}
