/**
 * Turn a worker progress update into a percentage + human label. Shared by the
 * status chip and anything else that renders generation progress.
 *
 * The gzip guard: GitHub Pages serves a gzip-compressed content-length, so a
 * streamed download delivers more (decompressed) bytes than `total`. When
 * done exceeds total we drop to an indeterminate "downloaded MB" label instead
 * of a bogus >100% percentage.
 */

import type { ProgressKind } from "../flowgen/types";

const fmtMB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

export interface FormattedProgress {
  pct: number | null; // null → indeterminate bar
  label: string;
}

export function formatProgress(
  phase: string,
  done: number,
  total: number,
  kind: ProgressKind,
): FormattedProgress {
  if (kind === "bytes" && total > 0 && done <= total * 1.02) {
    const pct = Math.min(100, Math.round((done / total) * 100));
    return { pct, label: `${phase} — ${fmtMB(done)} / ${fmtMB(total)} (${pct}%)` };
  }
  if (kind === "bytes") {
    return { pct: null, label: `${phase} — ${fmtMB(done)}` };
  }
  if (kind === "count" && total > 0) {
    const pct = Math.min(100, Math.round((done / total) * 100));
    return { pct, label: phase };
  }
  return { pct: null, label: `${phase}…` };
}
