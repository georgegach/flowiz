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
    u = (arr[..., 0].astype(np.float64) - 2**15) / 64.0
    v = (arr[..., 1].astype(np.float64) - 2**15) / 64.0
    valid = arr[..., 2] > 0
    data = np.dstack([u, v]).astype(np.float32)
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
    be = arr.astype(">u2")
    rows = bytearray()
    row_bytes = w * c * 2
    flat = be.tobytes()
    for y in range(h):
        rows.append(0)  # filter type 0 (none)
        rows.extend(flat[y * row_bytes : (y + 1) * row_bytes])
    idat = zlib.compress(bytes(rows), 6)
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
    bytes_per_sample = bit_depth // 8
    bpp = channels * bytes_per_sample
    stride = width * bpp
    out = bytearray(height * stride)
    pos = 0
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        row = y * stride
        for x in range(stride):
            rb = raw[pos]
            pos += 1
            a = out[row + x - bpp] if x >= bpp else 0
            b = out[row - stride + x] if y > 0 else 0
            c = out[row - stride + x - bpp] if (x >= bpp and y > 0) else 0
            if ftype == 1:
                val = rb + a
            elif ftype == 2:
                val = rb + b
            elif ftype == 3:
                val = rb + ((a + b) >> 1)
            elif ftype == 4:
                val = rb + _paeth(a, b, c)
            else:
                val = rb
            out[row + x] = val & 0xFF
    arr = np.frombuffer(bytes(out), dtype=np.uint8)
    if bit_depth == 16:
        arr = arr.reshape(-1, 2).astype(np.uint16)
        return (arr[:, 0] << 8) | arr[:, 1]  # PNG is big-endian
    return arr.astype(np.uint16)


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c
