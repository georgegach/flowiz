/**
 * Filmstrip with real per-frame thumbnails. Thumbnails are sampled on the CPU
 * (nearest-neighbour, ~64px wide, per-thumb magnitude normalisation over the
 * sampled grid) — never the full-res frame, never the WebGL renderer — and are
 * generated lazily via an IntersectionObserver so a 1000-frame sequence only
 * paints what's near the strip. A generation token invalidates in-flight work
 * when the frame set is replaced.
 */

import type { FlowField } from "../flow";
import { uvToColor } from "../colorwheel";

const TW = 64; // thumbnail width, px

export interface Filmstrip {
  setFrames(frames: FlowField[]): void;
  appendFrame(frame: FlowField): void;
  setCurrent(i: number): void;
}

export function setupFilmstrip(el: HTMLElement, onSelect: (i: number) => void): Filmstrip {
  let frames: FlowField[] = [];
  let current = -1;
  let currentBtn: HTMLElement | null = null;
  let gen = 0;
  let io: IntersectionObserver | null = null;
  const scratch = document.createElement("canvas");

  function thumbURL(f: FlowField): string {
    const th = Math.max(8, Math.min(48, Math.round((TW * f.height) / f.width)));
    const sample = (tx: number, ty: number) => {
      const fx = Math.min(f.width - 1, Math.floor((tx / TW) * f.width));
      const fy = Math.min(f.height - 1, Math.floor((ty / th) * f.height));
      return fy * f.width + fx;
    };
    // pass 1: local max magnitude over the sampled grid only (cheap)
    let max = 1e-6;
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < TW; tx++) {
        const si = sample(tx, ty);
        const m = Math.hypot(f.data[si * 2], f.data[si * 2 + 1]);
        if (m > max && Number.isFinite(m)) max = m;
      }
    }
    // pass 2: colorize nearest-neighbour samples
    const img = new ImageData(TW, th);
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < TW; tx++) {
        const si = sample(tx, ty);
        const di = (ty * TW + tx) * 4;
        img.data[di + 3] = 255;
        if (f.valid && !f.valid[si]) continue; // invalid → black
        const [r, g, b] = uvToColor(f.data[si * 2] / max, f.data[si * 2 + 1] / max);
        img.data[di] = r;
        img.data[di + 1] = g;
        img.data[di + 2] = b;
      }
    }
    scratch.width = TW;
    scratch.height = th;
    scratch.getContext("2d")!.putImageData(img, 0, 0);
    return scratch.toDataURL();
  }

  function makeObserver(token: number): IntersectionObserver {
    return new IntersectionObserver(
      (entries, observer) => {
        if (token !== gen) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const btn = entry.target as HTMLElement;
          if (!btn.dataset.done) {
            const idx = Number(btn.dataset.i);
            const f = frames[idx];
            const el2 = btn.querySelector("img");
            if (f && el2) {
              el2.src = thumbURL(f);
              btn.dataset.done = "1";
            }
          }
          observer.unobserve(btn);
        }
      },
      { root: el, rootMargin: "0px 200px" },
    );
  }

  function addButton(i: number) {
    const btn = document.createElement("button");
    btn.className = "thumb";
    btn.dataset.i = String(i);
    btn.title = frames[i].name;
    btn.setAttribute("aria-label", `Frame ${i + 1}`);
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    const num = document.createElement("span");
    num.className = "thumb-n";
    num.textContent = String(i + 1);
    btn.append(img, num);
    btn.addEventListener("click", () => onSelect(i));
    if (i === current) {
      btn.setAttribute("aria-current", "true");
      currentBtn = btn;
    }
    el.appendChild(btn);
    io?.observe(btn);
  }

  function setFrames(next: FlowField[]) {
    gen++;
    io?.disconnect();
    io = makeObserver(gen);
    frames = next;
    current = -1;
    currentBtn = null;
    el.innerHTML = "";
    for (let i = 0; i < frames.length; i++) addButton(i);
    (el as HTMLElement).hidden = frames.length < 2;
  }

  function appendFrame(frame: FlowField) {
    if (!io) {
      gen++;
      io = makeObserver(gen);
    }
    frames.push(frame);
    addButton(frames.length - 1);
    (el as HTMLElement).hidden = frames.length < 2;
  }

  function setCurrent(i: number) {
    if (i === current) return;
    current = i;
    currentBtn?.removeAttribute("aria-current");
    const b = el.children[i] as HTMLElement | undefined;
    currentBtn = b ?? null;
    if (b) {
      b.setAttribute("aria-current", "true");
      // Scroll ONLY the strip's own horizontal scroll to reveal the active
      // thumb — never scrollIntoView, which scrolls the whole page and yanks the
      // viewport off the image (e.g. during playback).
      const target = b.offsetLeft - (el.clientWidth - b.clientWidth) / 2;
      const max = el.scrollWidth - el.clientWidth;
      el.scrollLeft = Math.max(0, Math.min(max, target));
    }
  }

  return { setFrames, appendFrame, setCurrent };
}
