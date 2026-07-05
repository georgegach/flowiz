/**
 * Flow-format converter panel. Pick a target format + scope, one click writes
 * the file(s) and downloads them. Lives in the controls sidebar as a first-class
 * action. All conversion is client-side (see export/convert.ts).
 */

import type { FlowField } from "../flow";
import { FORMATS, formatMeta, baseName, sourceLabel, convert, type ConvertFormat } from "../export/convert";

const DL_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6"/></svg>`;

export interface ConvertContext {
  getFrames: () => FlowField[];
  getCurrent: () => number;
  notify: (msg: string, kind?: "error" | "info") => void;
}

export interface ConvertPanel {
  update: () => void;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function setupConvertPanel(container: HTMLElement, ctx: ConvertContext): ConvertPanel {
  let fmt = (localStorage.getItem("flowiz.convertFormat") as ConvertFormat) || "npy";
  if (!FORMATS.some((m) => m.id === fmt)) fmt = "npy";
  let scope: "one" | "all" = (localStorage.getItem("flowiz.convertScope") as "one" | "all") || "all";

  container.innerHTML = `
    <label>Convert format</label>
    <div class="convert">
      <div class="convert-from">from <b id="cv-from">—</b> to</div>
      <div class="segmented formats" id="cv-fmt" role="group" aria-label="Target format">
        ${FORMATS.map(
          (m) =>
            `<button data-fmt="${m.id}" title="${m.desc}" aria-pressed="${m.id === fmt}" class="${m.id === fmt ? "active" : ""}">
               <span class="fmt-name">${m.label}</span><span class="fmt-sub">${m.sub}</span>
             </button>`,
        ).join("")}
      </div>
      <div class="segmented scope" id="cv-scope" role="group" aria-label="Scope" hidden>
        <button data-scope="one" aria-pressed="false">This frame</button>
        <button data-scope="all" aria-pressed="false">All frames</button>
      </div>
      <p class="convert-note" id="cv-note" hidden></p>
      <button id="cv-go" class="primary"><span class="cv-ico">${DL_SVG}</span><span id="cv-go-label">Download</span></button>
    </div>`;

  const fmtBox = container.querySelector<HTMLDivElement>("#cv-fmt")!;
  const scopeBox = container.querySelector<HTMLDivElement>("#cv-scope")!;
  const fromEl = container.querySelector<HTMLElement>("#cv-from")!;
  const noteEl = container.querySelector<HTMLParagraphElement>("#cv-note")!;
  const goBtn = container.querySelector<HTMLButtonElement>("#cv-go")!;
  const goLabel = container.querySelector<HTMLSpanElement>("#cv-go-label")!;
  const goIco = container.querySelector<HTMLSpanElement>(".cv-ico")!;
  let doneTimer: number | null = null;

  function indicesForScope(frames: FlowField[]): number[] {
    if (scope === "all" && frames.length > 1) return frames.map((_, i) => i);
    return [ctx.getCurrent()];
  }

  function update() {
    const frames = ctx.getFrames();
    const many = frames.length > 1;
    scopeBox.hidden = !many;

    // source format of the current frame
    const cur = frames[ctx.getCurrent()];
    fromEl.textContent = cur ? sourceLabel(cur.name) : "—";

    fmtBox.querySelectorAll("button").forEach((b) => {
      const on = (b as HTMLElement).dataset.fmt === fmt;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    scopeBox.querySelectorAll("button").forEach((b) => {
      const on = (b as HTMLElement).dataset.scope === scope;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    scopeBox.querySelector<HTMLButtonElement>('[data-scope="all"]')!.textContent =
      `All ${frames.length} frames`;

    // lossy warning for Color
    const meta = formatMeta(fmt);
    noteEl.hidden = !meta.lossy;
    if (meta.lossy) noteEl.textContent = "Colorized preview — pixels aren't re-parseable flow.";

    // button label reflects exactly what will download
    if (doneTimer === null) {
      const indices = indicesForScope(frames);
      if (indices.length > 1) {
        goLabel.textContent = `Download ${indices.length} files · .zip`;
      } else if (cur) {
        goLabel.textContent = `Download ${baseName(cur.name)}${meta.ext}`;
      } else {
        goLabel.textContent = "Download";
      }
    }
  }

  fmtBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    fmt = b.dataset.fmt as ConvertFormat;
    localStorage.setItem("flowiz.convertFormat", fmt);
    update();
  });

  scopeBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    scope = b.dataset.scope as "one" | "all";
    localStorage.setItem("flowiz.convertScope", scope);
    update();
  });

  goBtn.addEventListener("click", async () => {
    const frames = ctx.getFrames();
    if (!frames.length) return;
    goBtn.classList.add("busy");
    goBtn.disabled = true;
    try {
      const { blob, filename } = await convert(frames, indicesForScope(frames), fmt);
      download(blob, filename);
      // brief success affordance (icon + label swap on stable nodes)
      if (doneTimer !== null) clearTimeout(doneTimer);
      goBtn.classList.add("done");
      goIco.innerHTML = CHECK_SVG;
      goLabel.textContent = "Downloaded";
      doneTimer = window.setTimeout(() => {
        doneTimer = null;
        goBtn.classList.remove("done");
        goIco.innerHTML = DL_SVG;
        update();
      }, 1500);
    } catch (err) {
      ctx.notify((err as Error).message);
    } finally {
      goBtn.classList.remove("busy");
      goBtn.disabled = false;
    }
  });

  update();
  return { update };
}
