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

# The viewer only needs DISOpticalFlow.create(preset) + the inherited calc().
# calc() is declared on the DenseOpticalFlow base, so whitelist both — embind
# wires the inheritance so dis.calc(...) resolves on the DIS instance.
dis = (
    "        'DenseOpticalFlow': ['calc'],\n"
    "        'DISOpticalFlow': ['create'],\n"
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

# NOTE: --build_flags MUST end with a trailing space. build_js.py concatenates
# its own `-s EXPORTED_FUNCTIONS=...` directly onto this string with no
# separator; without the trailing space the last flag fuses into `...=1-s ...`,
# which corrupts CMAKE_CXX_FLAGS and makes every compiler probe (incl. the CPU
# baseline check) fail. That mis-diagnoses as a baseline error — do not remove.
echo "::group::Build (emscripten, SIMD, ES6 module, no threads)"
docker run --rm \
  -v "$WORK/opencv:/src" \
  -u "$(id -u):$(id -g)" \
  "$EMSDK_IMG" \
  python3 /src/platforms/js/build_js.py /src/build_js \
    --build_wasm \
    --disable_single_file \
    --simd \
    --cmake_option="-DBUILD_LIST=core,imgproc,video,js" \
    --build_flags="-s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=cv -s ENVIRONMENT=web,worker "
echo "::endgroup::"

echo "::group::Locate + verify build artifacts"
# Use the raw emscripten MODULARIZE+EXPORT_ES6 module (opencv_js.js), NOT the
# UMD wrapper opencv.js that make_umd.py emits — dis.ts does `import(url).default`.
JS="$(find "$WORK/opencv/build_js" -name 'opencv_js.js' | head -1)"
WASM="$(find "$WORK/opencv/build_js" -name 'opencv_js.wasm' | head -1)"
echo "js=$JS"
echo "wasm=$WASM"
[ -n "$JS" ] && [ -n "$WASM" ] || { echo "::error::build artifacts not found"; exit 1; }

# embind class-name strings live in the WASM data section, not the JS glue —
# so verify DISOpticalFlow in the .wasm (grepping the JS gives a false negative).
DIS_HITS="$(strings "$WASM" | grep -c DISOpticalFlow || true)"
echo "DISOpticalFlow occurrences in opencv_js.wasm: $DIS_HITS"
[ "$DIS_HITS" -gt 0 ] || { echo "::error::DISOpticalFlow missing from build (whitelist not applied?)"; exit 1; }

# Confirm the JS really is an ES module (default export factory).
if ! grep -qE 'export default|export\s*\{' "$JS"; then
  echo "::error::opencv_js.js is not an ES module (no export). EXPORT_ES6 ignored?"
  exit 1
fi
echo "::endgroup::"

echo "::group::Install into repo"
mkdir -p "$OUT_DIR"
cp "$JS"   "$OUT_DIR/opencv-dis.js"
cp "$WASM" "$OUT_DIR/opencv-dis.wasm"
ls -la "$OUT_DIR"
echo "::endgroup::"
