#!/usr/bin/env bash
# Build a slim opencv.js (core + imgproc + video/DISOpticalFlow) as an ES module
# for the viewer's "Fastest" flow tier. Stock opencv.js does NOT whitelist
# DISOpticalFlow, so we patch the whitelist and rebuild via the emscripten SDK.
#
# Output (copied into the repo by the workflow):
#   viewer/public/vendor/opencv/opencv-dis.js    (ES module, default export = factory)
#   viewer/public/vendor/opencv/opencv-dis.wasm
#
# Constraints (see docs/OPTICAL-FLOW-GENERATION-SDD.md §12): single-threaded
# (GitHub Pages has no COOP/COEP), SIMD on, separate .wasm file.
set -euo pipefail

OPENCV_TAG="${OPENCV_TAG:-4.10.0}"
EMSDK_IMG="${EMSDK_IMG:-emscripten/emsdk:3.1.64}"
WORK="${WORK:-$PWD/_opencv_build}"
OUT_DIR="$PWD/viewer/public/vendor/opencv"

echo "::group::Clone OpenCV $OPENCV_TAG"
rm -rf "$WORK"
git clone --depth 1 --branch "$OPENCV_TAG" https://github.com/opencv/opencv "$WORK/opencv"
echo "::endgroup::"

echo "::group::Patch JS whitelist (add DISOpticalFlow)"
python3 - "$WORK/opencv/platforms/js/opencv_js.config.py" <<'PY'
import re, sys
p = sys.argv[1]
src = open(p).read()

dis = (
    "        'DISOpticalFlow': ['create', 'calc', 'setFinestScale', 'setPatchSize', "
    "'setPatchStride', 'setGradientDescentIterations', 'setVariationalRefinementIterations'],\n"
)

# The `video` module whitelist is a dict literal: `video = {  ... }`.
m = re.search(r"\nvideo\s*=\s*\{", src)
if not m:
    sys.exit("could not find `video = {` in opencv_js.config.py")
insert_at = m.end()
src = src[:insert_at] + "\n" + dis + src[insert_at:]

open(p, "w").write(src)
print("Patched video whitelist. Context:")
i = src.index("\nvideo")
print(src[i:i+400])
PY
echo "::endgroup::"

echo "::group::Build (emscripten, SIMD, ES6 module, no threads)"
docker run --rm \
  -v "$WORK/opencv:/src" \
  -u "$(id -u):$(id -g)" \
  "$EMSDK_IMG" \
  python3 /src/platforms/js/build_js.py /src/build_js \
    --build_wasm \
    --disable_single_file \
    --cmake_option="-DBUILD_LIST=core,imgproc,video" \
    --cmake_option="-DCV_DISABLE_OPTIMIZATION=ON" \
    --cmake_option="-DCPU_BASELINE=" \
    --cmake_option="-DCPU_DISPATCH=" \
    --cmake_option="-DCPU_BASELINE_REQUIRE=" \
    --build_flags="-s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=cv -s ENVIRONMENT=web,worker -s USE_ES6_IMPORT_META=1"
echo "::endgroup::"

echo "::group::Locate + verify build artifacts"
JS="$(find "$WORK/opencv/build_js" -name 'opencv.js' | head -1)"
WASM="$(find "$WORK/opencv/build_js" -name 'opencv_js.wasm' -o -name 'opencv.wasm' | head -1)"
echo "js=$JS"
echo "wasm=$WASM"
[ -n "$JS" ] && [ -n "$WASM" ] || { echo "::error::build artifacts not found"; exit 1; }

DIS_HITS="$(grep -c DISOpticalFlow "$JS" || true)"
echo "DISOpticalFlow occurrences in opencv.js: $DIS_HITS"
[ "$DIS_HITS" -gt 0 ] || { echo "::error::DISOpticalFlow missing from build"; exit 1; }

# Confirm it really is an ES module (default export factory).
if ! grep -qE 'export default|export\s*\{' "$JS"; then
  echo "::error::opencv.js is not an ES module (no export). EXPORT_ES6 flag ignored?"
  exit 1
fi
echo "::endgroup::"

echo "::group::Install into repo"
mkdir -p "$OUT_DIR"
cp "$JS"   "$OUT_DIR/opencv-dis.js"
cp "$WASM" "$OUT_DIR/opencv-dis.wasm"
ls -la "$OUT_DIR"
echo "::endgroup::"
