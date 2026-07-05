/** Fetch a URL into an ArrayBuffer while reporting byte-level download progress. */

export async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download ${url.split("/").pop()}: HTTP ${resp.status} ${resp.statusText}`);
  }
  const total = Number(resp.headers.get("content-length")) || 0;
  if (!resp.body) return resp.arrayBuffer(); // no streaming — fall back

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    loaded += result.value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}
