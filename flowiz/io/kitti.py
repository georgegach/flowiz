"""KITTI optical flow format (16-bit 3-channel PNG).

KITTI stores flow as ``uint16``: ``flow = (value - 2**15) / 64`` for channels
0 (u) and 1 (v); channel 2 is the valid mask (>0 means valid).

Pillow's 16-bit RGB PNG support is incomplete, so this module carries a small
self-contained 16-bit PNG codec (encode with filter 0, decode all 5 filters)
that round-trips our own output and reads real KITTI files.
"""

from __future__ import annotations

import struct
import zlib

import numpy as np

from flowiz.core.flow import Flow

_PNG_SIG = b"\x89PNG\r\n\x1a\n"


def decode_kitti_array(arr: np.ndarray, source: str = "array") -> Flow:
    """Decode a KITTI ``(H, W, 3)`` uint16 array into a :class:`Flow`."""
    if arr.dtype != np.uint16 or arr.ndim != 3 or arr.shape[2] < 3:
        raise ValueError(
            f"Not a KITTI flow array (need uint16 HxWx3, got {arr.dtype} {arr.shape})."
        )
    # (n - 2**15) / 64 is an exact multiple of 1/64, so float32 is lossless here
    # and avoids float64 intermediates + an extra full-array cast.
    u = (arr[..., 0].astype(np.float32) - 2**15) / 64.0
    v = (arr[..., 1].astype(np.float32) - 2**15) / 64.0
    valid = arr[..., 2] > 0
    data = np.dstack([u, v])
    data[~valid] = 0.0
    return Flow(data=data, valid=valid, source=source)


def encode_kitti_array(flow: Flow) -> np.ndarray:
    """Encode a :class:`Flow` into a KITTI ``(H, W, 3)`` uint16 array."""
    h, w = flow.shape
    out = np.zeros((h, w, 3), dtype=np.uint16)
    out[..., 0] = np.clip(flow.u * 64.0 + 2**15, 0, 2**16 - 1).astype(np.uint16)
    out[..., 1] = np.clip(flow.v * 64.0 + 2**15, 0, 2**16 - 1).astype(np.uint16)
    valid = flow.valid if flow.valid is not None else np.ones((h, w), dtype=bool)
    out[..., 2] = valid.astype(np.uint16)
    return out


def read_kitti(path: str) -> Flow:
    """Read a KITTI 16-bit flow PNG into a :class:`Flow`."""
    with open(path, "rb") as f:
        arr = _read_png16(f.read())
    return decode_kitti_array(arr, source=path)


def write_kitti(flow: Flow, path: str) -> None:
    """Write a :class:`Flow` to a KITTI 16-bit flow PNG."""
    arr = encode_kitti_array(flow)
    with open(path, "wb") as f:
        f.write(_write_png16(arr))


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _write_png16(arr: np.ndarray) -> bytes:
    h, w, c = arr.shape
    if c != 3:
        raise ValueError("Only 3-channel 16-bit PNG writing is supported.")
    ihdr = struct.pack(">IIBBBBB", w, h, 16, 2, 0, 0, 0)  # 16-bit, truecolor RGB
    row_bytes = w * c * 2
    # Prepend a per-row filter byte (0 = none) to the big-endian sample bytes,
    # vectorized — no per-row Python loop.
    be = np.ascontiguousarray(arr, dtype=">u2").reshape(h, w * c).view(np.uint8)
    rows = np.empty((h, 1 + row_bytes), dtype=np.uint8)
    rows[:, 0] = 0  # filter type 0 (none)
    rows[:, 1:] = be
    idat = zlib.compress(rows.tobytes(), 6)
    return _PNG_SIG + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


def _read_png16(buf: bytes) -> np.ndarray:
    if buf[:8] != _PNG_SIG:
        raise ValueError("Not a PNG file.")
    pos = 8
    width = height = bit_depth = color_type = 0
    idat = bytearray()
    while pos < len(buf):
        (length,) = struct.unpack(">I", buf[pos : pos + 4])
        tag = buf[pos + 4 : pos + 8]
        data = buf[pos + 8 : pos + 8 + length]
        if tag == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
        elif tag == b"IDAT":
            idat.extend(data)
        elif tag == b"IEND":
            break
        pos += 12 + length
    channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(color_type, 3)
    raw = zlib.decompress(bytes(idat))
    samples = _unfilter(raw, width, height, channels, bit_depth)
    return samples.reshape(height, width, channels)


def _unfilter(raw: bytes, width: int, height: int, channels: int, bit_depth: int) -> np.ndarray:
    """Reverse PNG scanline filtering (all 5 types), row-vectorized.

    Filters None/Up/Sub are fully vectorized; Average/Paeth carry a genuine
    left-neighbor dependency, so they loop over pixels (``width`` iterations)
    but process all ``bpp`` byte-lanes at once — far cheaper than the old
    per-byte (``height * stride``) Python loop.
    """
    bpp = channels * (bit_depth // 8)
    stride = width * bpp
    raw_arr = np.frombuffer(raw, dtype=np.uint8)

    out = np.empty((height, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.uint8)
    pos = 0
    for y in range(height):
        ftype = int(raw_arr[pos])
        line = raw_arr[pos + 1 : pos + 1 + stride]
        pos += 1 + stride
        if ftype == 2:  # Up
            recon = line + prev  # uint8 arithmetic wraps mod 256
        elif ftype == 1:  # Sub — per-lane cumulative sum mod 256
            acc = np.cumsum(line.reshape(width, bpp).astype(np.int64), axis=0)
            recon = (acc & 0xFF).astype(np.uint8).reshape(stride)
        elif ftype == 3:  # Average
            recon = _unfilter_average(line, prev, width, bpp)
        elif ftype == 4:  # Paeth
            recon = _unfilter_paeth(line, prev, width, bpp)
        else:  # 0 = None (and any unknown byte, matching the old fallthrough)
            recon = line.copy()
        out[y] = recon
        prev = recon

    flat = out.reshape(-1)
    if bit_depth == 16:
        pairs = flat.reshape(-1, 2).astype(np.uint16)
        return (pairs[:, 0] << 8) | pairs[:, 1]  # PNG is big-endian
    return flat.astype(np.uint16)


def _unfilter_average(line: np.ndarray, prev: np.ndarray, width: int, bpp: int) -> np.ndarray:
    cur = line.reshape(width, bpp).astype(np.int32)
    up = prev.reshape(width, bpp).astype(np.int32)
    recon = np.empty((width, bpp), dtype=np.int32)
    left = np.zeros(bpp, dtype=np.int32)
    for p in range(width):
        left = (cur[p] + ((left + up[p]) >> 1)) & 0xFF
        recon[p] = left
    return recon.astype(np.uint8).reshape(width * bpp)


def _unfilter_paeth(line: np.ndarray, prev: np.ndarray, width: int, bpp: int) -> np.ndarray:
    cur = line.reshape(width, bpp).astype(np.int32)
    up = prev.reshape(width, bpp).astype(np.int32)
    recon = np.empty((width, bpp), dtype=np.int32)
    left = np.zeros(bpp, dtype=np.int32)
    upleft = np.zeros(bpp, dtype=np.int32)
    for p in range(width):
        b = up[p]
        left = (cur[p] + _paeth_vec(left, b, upleft)) & 0xFF
        recon[p] = left
        upleft = b
    return recon.astype(np.uint8).reshape(width * bpp)


def _paeth_vec(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Vectorized Paeth predictor over one row's byte-lanes."""
    p = a + b - c
    pa, pb, pc = np.abs(p - a), np.abs(p - b), np.abs(p - c)
    return np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))
