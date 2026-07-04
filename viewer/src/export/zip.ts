/** Bundle a sequence's raw flow (every format the viewer parses) into a ZIP via fflate. */

import { zipSync, type Zippable } from "fflate";
import type { FlowField } from "../flow";
import { encodeFlo, encodeKittiPng, encodePfm, encodeNpy } from "./writers";

/**
 * `colorPngs` are pre-encoded 8-bit colorized PNGs (one per frame), produced by
 * the caller (e.g. OffscreenCanvas.convertToBlob) so this stays pure. May be empty.
 */
export function buildRawZip(
  frames: FlowField[],
  colorPngs: Uint8Array[],
  baseName: string,
): Uint8Array {
  const files: Zippable = {};
  const raw = { level: 6 as const };
  const store = { level: 0 as const };
  frames.forEach((f, i) => {
    const n = String(i + 1).padStart(4, "0");
    files[`${baseName}/flow/${n}.flo`] = [encodeFlo(f), raw];
    files[`${baseName}/kitti/${n}.png`] = [encodeKittiPng(f), store];
    files[`${baseName}/pfm/${n}.pfm`] = [encodePfm(f), raw];
    files[`${baseName}/npy/${n}.npy`] = [encodeNpy(f), raw];
    if (colorPngs[i]) files[`${baseName}/color/${n}.png`] = [colorPngs[i], store];
  });
  return zipSync(files);
}
