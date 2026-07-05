# Vendored opencv.js (DIS optical flow)

The **Fastest** tier uses OpenCV's `DISOpticalFlow`, which is **not** in the stock
opencv.js whitelist — you must build a slim custom `opencv.js` and drop two files here:

```
opencv-dis.js      # ES-module factory (default export)
opencv-dis.wasm    # ~3 MB
```

These are fetched at runtime by `src/flowgen/dis.ts` (via `import.meta.env.BASE_URL + "vendor/opencv/..."`),
so they must be committed (they are <50 MB — do **not** use Git LFS; GitHub Pages
branch deploys don't resolve LFS pointers).

## Build recipe

```bash
git clone --depth 1 --branch 4.10.0 https://github.com/opencv/opencv
# Edit opencv/platforms/js/opencv_js.config.py — trim white_list to:
#   core: Mat basics (Mat, matFromArray, ...)
#   imgproc: {cvtColor, resize}
#   video: add DISOpticalFlow with
#     'DISOpticalFlow': ['create','calc','setFinestScale','setPatchSize','setPatchStride',
#                        'setGradientDescentIterations','setVariationalRefinementIterations']

docker run --rm -v "$PWD/opencv:/src" -u "$(id -u):$(id -g)" emscripten/emsdk:3.1.64 \
  python3 /src/platforms/js/build_js.py /src/build_js \
  --build_wasm --disable_single_file --simd \
  --cmake_option="-DBUILD_LIST=core,imgproc,video"
```

Then make the output an ES module and copy it here:

- Add `-s MODULARIZE=1 -s EXPORT_ES6=1` to the emscripten link flags (patch
  `build_js.py`'s `--build_flags` or the generated link step) so `opencv.js`
  exports a factory as its default export.
- `cp opencv/build_js/bin/opencv.js  opencv-dis.js`
- `cp opencv/build_js/bin/opencv_js.wasm  opencv-dis.wasm`

**Verify** before committing (the class name lives in the wasm data section,
NOT the JS glue — grepping the .js gives a false negative):

```bash
strings opencv-dis.wasm | grep -c DISOpticalFlow   # must be > 0
grep -c 'export default' opencv-dis.js             # must be > 0 (ES module)
```

Note: install the raw emscripten module `opencv_js.js` (MODULARIZE + EXPORT_ES6,
default export = factory), NOT the UMD `opencv.js` that `make_umd.py` also emits.
This is all automated in `.github/scripts/build_opencv_dis.sh`.

## Pitfalls

- Do **not** pass `--threads`. GitHub Pages cannot serve COOP/COEP, so
  SharedArrayBuffer/threads won't work. `--simd` is fine and recommended.
- Keep the `.wasm` separate (`--disable_single_file`) so it streams/compiles.
- If you rebuild against a different OpenCV version, re-verify the
  `DISOPTICAL_FLOW_PRESET_*` enum names used in `src/flowgen/dis.ts`.
