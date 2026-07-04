# flowiz Learn Panel — Software Design Document (SDD)

> **Audience.** The implementing agent (Opus). This document is meant to be complete
> enough that no further design decisions are required. Content lives in a sibling file,
> `LEARN-PANEL-CONTENT.md` — copy its prose **verbatim**. This document covers *how to
> build the panel that displays it*.

---

## 1. Context & goal

The flowiz web viewer (`viewer/`, deployed to `georgegach.github.io/flowiz/`) renders
optical-flow files but never explains what optical flow *is*. This feature adds a
**full-viewport, visually rich, academically grounded "Learn" panel** — an in-app guide /
onboarding surface — opened from a button in the existing GUI. It teaches optical flow from
first principles (history, math, the color encoding, formats/benchmarks, real-world
utility) in Matt-Pocock "teach-me" style: concrete-first, layered depth, "why it matters"
framing. **No quizzes, no interactivity beyond navigation and the live diagrams.**

**Outcome:** a first-time visitor can click one button and come away understanding what the
tool is for; an expert gets a correct, citable refresher.

---

## 2. Architectural constraints (READ FIRST — these are where mistakes happen)

The viewer is **vanilla TypeScript + WebGL2, no framework**. `viewer/src/main.ts` builds
the entire UI by assigning a template literal to `app.innerHTML` once at startup, then
wiring DOM listeners imperatively. Respect this. Specifically:

1. **Do NOT add a framework or any runtime dependency.** The only runtime dep is `pako`.
   No React/Preact/Vue, no markdown-parser lib, no CSS framework, no icon package, no
   external fonts/CDN. Content ships as TypeScript template strings.
2. **Do NOT re-render or clobber `#app`.** `main.ts` owns `app.innerHTML`. The Learn panel
   must be a **separate element appended to `document.body`** (or to `#app` *after* the
   existing markup) and toggled with the `hidden` attribute — never by rewriting the shell.
3. **Theme via CSS variables only.** Light/dark is a `:root.dark` class toggle
   (`main.ts` theme button → `document.documentElement.classList.toggle("dark")`). Style
   the panel exclusively with the existing custom properties (`--bg`, `--panel`,
   `--panel-2`, `--fg`, `--muted`, `--accent`, `--border`) defined at the top of
   `style.css`. **Never hardcode hex colors** for chrome — it breaks the toggle. (The
   *figures* legitimately use flow colors; see §5.)
4. **Asset paths need `import.meta.env.BASE_URL`.** Pages deploys under a subpath and
   `vite.config.ts` sets `base: "./"`. Any fetch (e.g. reusing `public/samples/*.flo`) must
   prefix `import.meta.env.BASE_URL`, exactly as `examples.ts` does. Prefer generating
   figures in-canvas (no fetch) to avoid this entirely.
5. **Keyboard handling.** `main.ts` binds global `keydown` (arrow keys → frame navigation,
   etc.). While the Learn panel is open it must **`stopPropagation()` on its own keydown**
   (so arrows scroll the guide, not the filmstrip) and handle **Escape → close**. On close,
   **restore focus** to the element that opened it and restore body scroll.
6. **Lock body scroll while open.** Add a class to `document.documentElement` (e.g.
   `learn-open`) that sets `overflow: hidden`, and remove it on close. Do not leave the page
   scroll-trapped.
7. **Lazy init.** Build the panel DOM on **first open**, not at startup, so it costs nothing
   for users who never open it and keeps the initial bundle lean.
8. **DPR supersampling for canvas figures.** Every canvas figure must render at
   `devicePixelRatio` backing resolution and be down-displayed via CSS size — mirror the
   existing `paintWheel` pattern (`main.ts`, `backingSize = px * dpr`). Skipping this yields
   blurry wheels.
9. **Middlebury convention is tested — match it.** Reuse `uvToColor` / `makeColorwheel` /
   `NCOLS` from `colorwheel.ts` for anything color-wheel-related. `u` → right, `v` → down;
   hue = direction, brightness/saturation = magnitude; 55 colors. `colorwheel.test.ts`
   guards parity — do not reimplement the math.
10. **Do not touch `render.ts`.** Figures are 2-D `<canvas>` (CPU-drawn via `uvToColor`),
    independent of the WebGL renderer. No changes to the flow renderer are needed or wanted.
11. **Do not invent citations.** Every reference is spelled out in the content file. Copy
    them exactly; do not add, "correct," or reformat author lists or years.
12. **Bundle budget.** The PRD targets <300 KB gzip for the viewer. Content-as-strings plus
    a few canvas draws stays tiny. Do not import heavy libs to render prose.

---

## 3. Files to create / modify

**New files (all under `viewer/src/`):**

| File | Responsibility |
| --- | --- |
| `learn-content.ts` | Typed content model: an ordered array of `Section` objects `{ id, title, html }` where `html` is the prose from `LEARN-PANEL-CONTENT.md` as template strings, plus figure-anchor markers. **No logic.** |
| `learn-figures.ts` | Pure functions that draw each live diagram onto a supplied `<canvas>` (see Figure Inventory §5). Depends only on `colorwheel.ts` and, where useful, the `synth()`-style generators. |
| `learn.ts` | The panel controller: builds DOM from `learn-content.ts` on first open, mounts figures, wires TOC + scroll-spy (IntersectionObserver), open/close/Escape/focus/scroll-lock, and hash deep-linking. Exposes `openLearn(sectionId?)` / `closeLearn()`. |

**Modified files:**

| File | Change |
| --- | --- |
| `viewer/src/main.ts` | (a) Add a **"Learn"** button in `header.topbar` beside the Docs/GitHub links. (b) Add a **"New to optical flow? Start here →"** link inside the empty dropzone (`#drop`) markup. (c) `import { openLearn } from "./learn"` and wire both triggers. (d) On startup, if `location.hash` starts with `#learn`, call `openLearn(...)`. |
| `viewer/src/style.css` | Append a `/* ===== Learn panel ===== */` block: full-viewport overlay, content column (`max-width: 72ch`, centered), full-bleed figure breakouts, sticky TOC rail, mobile stacking at the existing `@media (max-width: 720px)` breakpoint, `.learn-open { overflow: hidden }` on the root. Variables only for chrome. |

No changes to `render.ts`, `flow.ts`, build config, or tests (optionally add a small
`learn-figures.test.ts` smoke test that each draw function runs without throwing on a
stub canvas — nice-to-have, not required).

---

## 4. DOM & interaction spec

**Panel structure** (built once, lazily):

```
<section id="learn" hidden aria-modal="true" role="dialog" aria-label="Learn: optical flow">
  <header class="learn-bar">
    <span class="learn-title">Understanding Optical Flow</span>
    <button class="learn-close" aria-label="Close">✕</button>
  </header>
  <div class="learn-body">
    <nav class="learn-toc"> … one link per section, scroll-spy .active … </nav>
    <article class="learn-article">
      … per section: <section id="learn-<id>"> <h2> … content … figure canvases … </section>
    </article>
  </div>
</section>
```

- **Open:** un-hide, add `learn-open` to root (scroll lock), remember `document.activeElement`
  to restore later, move focus to the close button, lazily draw all figure canvases if not
  yet drawn. If a `sectionId` is given, scroll that section into view.
- **Close:** hide, remove `learn-open`, restore focus, leave hash as-is or clear `#learn`.
- **Escape** closes. **Click on close button** closes. (Optional: click on a dimmed
  backdrop margin closes — but the panel is full-viewport, so a backdrop is minor.)
- **Keyboard:** panel's own `keydown` handler calls `stopPropagation()` so `main.ts` global
  arrow handlers don't fire; Escape handled here.
- **TOC scroll-spy:** an `IntersectionObserver` over the section elements toggles `.active`
  on the corresponding TOC link. TOC is a **left sticky rail** on wide screens; collapses
  to a top horizontal strip (or a simple `<details>`) below 720px.
- **Deep links:** support `#learn` (open at top) and `#learn/<section-id>` (open + scroll).
  Update the hash on open so the state is shareable; don't spam history (`replaceState`).
- **Reduced motion:** respect `prefers-reduced-motion` — the two animated figures
  (aperture, flicker) should render a **static** representative frame instead of animating.

**Accessibility:** `role="dialog"`, `aria-modal`, focus trap is *light* (focus the close
button on open, restore on close) — a full focus trap is optional given the panel is
effectively the whole screen. Ensure the Learn trigger buttons are real `<button>`s.

---

## 5. Figure Inventory (live canvas diagrams)

Each figure is drawn by a function in `learn-figures.ts` onto a `<canvas>`, at DPR backing
resolution (§2.8), theme-aware where it draws chrome. Anchors match the `<!-- FIG:id -->`
markers in the content file. Reuse `uvToColor(u, v)` from `colorwheel.ts` for all
flow-colored pixels so figures match the real renderer exactly.

| FIG id | Section | What to draw |
| --- | --- | --- |
| `hero-triptych` | 0 | Three small panels side by side: (1) two-frame toy scene (a filled square shifted a few px between frames, drawn as two outlines), (2) its quiver arrows, (3) its Middlebury color image. Wire them to the *same* synthetic translation field so the three views obviously depict one thing. |
| `read-the-wheel` | 0 | The 55-color wheel (paint per-pixel via `uvToColor` on a normalized disc, anti-aliased rim exactly like `paintWheel`), with four labels around it — Right/Down/Left/Up — and a radial "slow → fast" gradient callout from center to rim. |
| `vector-field-quiver` | 1 | A dense `(u,v)` field (reuse a `synth` generator, e.g. rotation) shown as a downsampled quiver grid over a faint color version, illustrating "one arrow per pixel." |
| `aperture-problem` | 2 | **Animated** (respect reduced-motion): a straight edge drifting behind a circular aperture; show that only the perpendicular component is observable. Overlay the "true motion" arrow vs the "observed (normal) motion" arrow. Static fallback = one representative frame with both arrows. |
| `history-timeline` | 2 | A horizontal timeline: 1950 Gibson · 1981 Horn–Schunck & Lucas–Kanade · 2004 Brox · 2010 "Secrets" · 2015 FlowNet · 2018 PWC-Net · 2020 RAFT · 2022 FlowFormer · 2024 SEA-RAFT. Pure canvas/DOM; theme-aware line + dots + labels. (A styled HTML `<ol>` is acceptable instead of canvas here.) |
| `brightness-constancy` | 3 | 1-D illustration: a brightness profile `I(x)` at time t and the same profile shifted at t+dt; annotate `Iₓ`, `I_t`, and the constraint line in `(u,v)` space showing the family of solutions (the aperture ambiguity, geometric form). |
| `color-wheel-anatomy` | 4 | The wheel again but *dissected*: labeled hue ring (direction) and a magnitude gradient (white center → saturated rim), with the six hue-transition arcs (R→Y→G→C→B→M) and their step counts (15,6,4,11,13,6) annotated to match `makeColorwheel`. |
| `motion-archetypes` | 4 | 2×2 grid of colorized synthetic fields with captions: **translation** (flat color), **rotation** (`synth` rotation), **zoom/expansion** (`synth` zoom, radial rainbow), **boundary** (two half-planes with opposite flow → complementary-color seam). |
| `normalization-flicker` | 4 | **Animated** (respect reduced-motion): the same multi-frame magnitude sequence rendered two ways — per-frame normalization (visibly pulsing) vs global normalization (steady). Static fallback = two labeled still frames side by side. |
| `format-family` | 5 | Simple diagram: five format chips (`.flo`, KITTI PNG, `.pfm`, `.flo5`, `.npy`) all arrows-into one `fz.read` node → one color image. Can be styled HTML, no canvas needed. |
| `epe-errormap` | 5 | A predicted field vs a ground-truth field and the resulting per-pixel EPE heatmap (magma-like ramp). Use two synthetic fields whose difference is obvious; render error as a grayscale/warm ramp. Illustrative only. |
| `applications-grid` | 6 | A responsive grid of ~10 labeled icon-cards (compression, slow-mo, editing, driving, SLAM, medical, weather, fluids, biology, action recognition). Icons = simple inline SVG paths *authored inline in the TS* (no icon dependency) or unicode/emoji; keep it lightweight and theme-aware. |
| `closing-wheel` | 8 | A final large, high-quality color wheel (the app's signature legend) as a visual sign-off. Reuse the `paintWheel` supersampled path. |

**Figure implementation notes:**
- Prefer **canvas** for anything showing flow color; **styled HTML** is fine and preferred
  for the timeline, format-family, and applications-grid (less code, theme-free via
  variables).
- All synthetic fields should reuse the generator shape in `examples.ts` (`synth(name, w,
  h, fn)`), or a trimmed local copy — do not fetch anything for figures.
- Animated figures use `requestAnimationFrame`; **pause when the panel is hidden** and when
  `prefers-reduced-motion` is set (render one frame and stop).

---

## 6. Content mapping

`learn-content.ts` exports `SECTIONS: Section[]` in the order defined in
`LEARN-PANEL-CONTENT.md` (§0 orientation → §8 further-reading). Each `Section.id` matches
the `id` in the content file headings (`orientation`, `what-is-flow`, `history`,
`the-math`, `flow-to-color`, `formats-datasets`, `applications`, `using-flowiz`,
`further-reading`). The `<!-- FIG:id -->` markers indicate where to insert the
corresponding figure canvas within that section's HTML. Prose is transplanted **verbatim**;
render the light Markdown (bold, tables, code blocks, lists) as static HTML — hand-convert
it, do **not** pull in a Markdown parser.

---

## 7. Easy mistakes to avoid (checklist for the implementer)

- [ ] Added React / a markdown lib / any dependency → **wrong**; framework-free, `pako` only.
- [ ] Rebuilt `#app` innerHTML and wiped the viewer → append the panel separately.
- [ ] Hardcoded chrome colors → dark mode breaks; use `--bg/--fg/--accent/...`.
- [ ] Forgot `import.meta.env.BASE_URL` on a fetch → 404 on Pages subpath (avoid fetch; draw in canvas).
- [ ] Global arrow keys hijack the guide / Escape doesn't close → panel must `stopPropagation` and handle Escape.
- [ ] Body still scrollable / stays locked after close → toggle `learn-open` on the root.
- [ ] Blurry wheels → render at `devicePixelRatio` backing size (copy `paintWheel`).
- [ ] Reimplemented the color-wheel math or got u/v signs wrong → reuse `uvToColor`/`makeColorwheel`; parity is tested.
- [ ] Animations run while panel hidden / ignore reduced-motion → pause on hide, static fallback.
- [ ] Invented or reformatted a citation → copy from the content file exactly.
- [ ] Focus lost after close → restore `document.activeElement` captured on open.
- [ ] Panel built eagerly at startup → lazy-init on first open.

---

## 8. Verification

Per repo policy (`CLAUDE.md`: no local project execution on this Mac; build via CI):

1. `cd viewer && npm run build` — `tsc --noEmit` typechecks and `vite build` succeeds
   (run in CI, not locally). Bundle size still well under 300 KB gzip.
2. `npm run test` — existing `vitest` suite (incl. `colorwheel.test.ts`) still green; the
   Learn feature touches no tested modules.
3. **Manual smoke checklist** (reviewer, on the deployed Pages preview):
   - Learn button in header opens the full-viewport panel; dropzone link also opens it.
   - Close ✕ and Escape both close it; focus returns to the trigger; page scroll restored.
   - Toggle theme while open → all chrome recolors; figures still legible in both themes.
   - Narrow the window past 720px → TOC collapses, content stays readable, no horizontal scroll.
   - `…/#learn/the-math` opens the panel scrolled to the math section.
   - Every figure renders crisply (no blur); animated figures animate, and freeze under OS "reduce motion."
   - No console errors; arrow keys scroll the guide (not the filmstrip) while open.
4. **Content review:** every `<!-- FIG:id -->` in the content file has a matching figure in
   §5; every section id matches; citations match the content file.
5. Commit to `master`, push, and confirm the Pages workflow (`gh run watch`) builds and
   deploys (no local run).
