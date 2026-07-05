/**
 * Read-through Cache Storage layer for the big downloaded assets (RAFT onnx,
 * DIS/opencv wasm, ort wasm, ffmpeg core wasm). A second generation of the same
 * model then loads instantly from disk instead of re-downloading tens of MB.
 *
 * Importable from BOTH the main thread and the worker (`caches` exists in both
 * scopes). Every Cache Storage call is defensive: Cache API is absent on
 * insecure origins and `caches.open()` throws in Firefox private mode, so any
 * failure silently falls back to a plain network fetch — a cache problem must
 * never break a download.
 */

import { fetchWithProgress } from "./fetch-progress";

/** Bump the version suffix to invalidate every cached asset at once. */
export const ASSET_CACHE_NAME = "flowiz-assets-v1";

let sweptStale = false;
function sweepStaleCaches(): void {
  if (sweptStale) return;
  sweptStale = true;
  try {
    if (typeof caches === "undefined") return;
    caches
      .keys()
      .then((keys) => {
        for (const k of keys) {
          if (k.startsWith("flowiz-assets-") && k !== ASSET_CACHE_NAME) caches.delete(k);
        }
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(ASSET_CACHE_NAME);
  } catch {
    return null; // e.g. Firefox private mode throws SecurityError
  }
}

function guessType(url: string): string {
  if (url.endsWith(".wasm")) return "application/wasm";
  if (url.endsWith(".js")) return "text/javascript";
  return "application/octet-stream";
}

export interface CachedFetchResult {
  buffer: ArrayBuffer;
  fromCache: boolean;
}

/**
 * Fetch `url` through Cache Storage. On a hit, onProgress fires once with
 * done === total (so the bar snaps to 100%). On a miss, byte progress streams
 * as normal and the bytes are cached for next time.
 */
export async function cachedFetch(
  url: string,
  onProgress?: (loaded: number, total: number, fromCache: boolean) => void,
): Promise<CachedFetchResult> {
  sweepStaleCaches();
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const buffer = await hit.arrayBuffer();
        onProgress?.(buffer.byteLength, buffer.byteLength, true);
        return { buffer, fromCache: true };
      }
    } catch {
      /* fall through to the network */
    }
  }

  const buffer = await fetchWithProgress(url, (loaded, total) =>
    onProgress?.(loaded, total, false),
  );

  if (cache) {
    try {
      // The Response copies the bytes out of `buffer`; the original is not
      // detached, so we can still return it. Never clone/tee a consumed stream.
      await cache.put(url, new Response(buffer, { headers: { "content-type": guessType(url) } }));
    } catch {
      /* QuotaExceededError, private mode, etc. — serve uncached */
    }
  }
  return { buffer, fromCache: false };
}

/** True if `url` is already in the asset cache. False on any error. */
export async function isCached(url: string): Promise<boolean> {
  try {
    const cache = await openCache();
    if (!cache) return false;
    return !!(await cache.match(url));
  } catch {
    return false;
  }
}

/** Delete every flowiz asset cache (all versions). */
export async function clearAssetCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("flowiz-assets-")).map((k) => caches.delete(k)),
    );
  } catch {
    /* ignore */
  }
}

/** Best-effort total origin storage usage in bytes, or null if unavailable. */
export async function assetCacheUsage(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    return est?.usage ?? null;
  } catch {
    return null;
  }
}
