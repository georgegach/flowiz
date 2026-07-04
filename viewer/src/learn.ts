/**
 * The Learn panel: a full-viewport, lazily-built guide overlay.
 *
 * It is appended to <body>, NOT rendered into #app, so it never clobbers the
 * viewer shell. Chrome is themed with the existing CSS variables. Figures are
 * live canvases mounted on first open (see learn-figures.ts).
 */

import { SECTIONS } from "./learn-content";
import { mountFigure, type FigureHandle } from "./learn-figures";

let panel: HTMLElement | null = null;
let article: HTMLElement | null = null;
let tocLinks: HTMLAnchorElement[] = [];
let figureHandles: FigureHandle[] = [];
let figuresMounted = false;
let lastFocus: HTMLElement | null = null;
let spy: IntersectionObserver | null = null;

function build(): HTMLElement {
  const el = document.createElement("section");
  el.id = "learn";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Learn: understanding optical flow");

  const toc = SECTIONS.map(
    (s) => `<a href="#learn/${s.id}" data-target="${s.id}">${s.nav}</a>`,
  ).join("");

  const sections = SECTIONS.map(
    (s) => `
      <section id="learn-${s.id}" class="learn-section">
        <h2>${s.title}</h2>
        ${s.html}
      </section>`,
  ).join("");

  el.innerHTML = `
    <header class="learn-bar">
      <span class="learn-title"><svg class="learn-title-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12a2.4 2.4 0 1 0-2.4-2.4A4.8 4.8 0 1 0 14.4 14.4 7.2 7.2 0 1 1 7.2 7.2"/></svg>Understanding Optical Flow</span>
      <button class="learn-close" aria-label="Close guide" title="Close (Esc)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </header>
    <div class="learn-body">
      <nav class="learn-toc" aria-label="Contents">${toc}</nav>
      <article class="learn-article">${sections}</article>
    </div>`;

  document.body.appendChild(el);

  article = el.querySelector<HTMLElement>(".learn-article");
  tocLinks = Array.from(el.querySelectorAll<HTMLAnchorElement>(".learn-toc a"));

  el.querySelector(".learn-close")!.addEventListener("click", () => closeLearn());

  // TOC clicks scroll within the panel (don't leave a jumpy hash navigation).
  tocLinks.forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.dataset.target!;
      document.getElementById(`learn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#learn/${id}`);
    });
  });

  // Keep global viewer key handlers (arrow-scrubbing) from firing while open.
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeLearn();
      return;
    }
    e.stopPropagation();
  });

  // Scroll-spy for the TOC.
  spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id.replace("learn-", "");
        tocLinks.forEach((a) => a.classList.toggle("active", a.dataset.target === id));
      }
    },
    { root: article, rootMargin: "-45% 0px -50% 0px", threshold: 0 },
  );
  el.querySelectorAll(".learn-section").forEach((s) => spy!.observe(s));

  return el;
}

function mountFigures() {
  if (!panel) return;
  stopFigures();
  figureHandles = [];
  panel.querySelectorAll<HTMLElement>(".learn-fig[data-fig]").forEach((host) => {
    const h = mountFigure(host, host.dataset.fig!);
    if (h) figureHandles.push(h);
  });
  figuresMounted = true;
}

function stopFigures() {
  figureHandles.forEach((h) => h.stop());
  figureHandles = [];
}

// Re-theme canvas figures when the light/dark class flips while the panel is open.
const themeObserver = new MutationObserver(() => {
  if (panel && !panel.hidden && figuresMounted) mountFigures();
});

export function openLearn(sectionId?: string) {
  if (!panel) {
    panel = build();
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  lastFocus = document.activeElement as HTMLElement;
  panel.hidden = false;
  document.documentElement.classList.add("learn-open");
  mountFigures(); // (re)build figures and (re)start any animations

  const target = sectionId ? document.getElementById(`learn-${sectionId}`) : null;
  if (target) target.scrollIntoView({ block: "start" });
  else article?.scrollTo({ top: 0 });

  history.replaceState(null, "", sectionId ? `#learn/${sectionId}` : "#learn");
  (panel.querySelector(".learn-close") as HTMLElement)?.focus();
}

export function closeLearn() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  document.documentElement.classList.remove("learn-open");
  stopFigures();
  figuresMounted = false;
  if (location.hash.startsWith("#learn")) history.replaceState(null, "", location.pathname + location.search);
  lastFocus?.focus?.();
}

/** Open on load if the URL points at the guide, e.g. #learn or #learn/the-math. */
export function initLearnFromHash() {
  const h = location.hash;
  if (!h.startsWith("#learn")) return;
  const sec = h.startsWith("#learn/") ? h.slice("#learn/".length) : undefined;
  openLearn(sec || undefined);
}
