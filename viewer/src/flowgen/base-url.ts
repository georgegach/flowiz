/**
 * Absolute base URL for same-origin assets. Vite's `base: "./"` resolves
 * relatively, so we absolute-ize once against location — this keeps dev
 * (localhost) and the GitHub Pages subpath (/flowiz/) both correct, and gives
 * the worker a URL it can use without a `location` of its own.
 */
export function baseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}
