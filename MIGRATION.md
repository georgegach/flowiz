# Migrating to flowiz 3.0

flowiz 3.0 is a ground-up rewrite with a new, typed API. The v2 functions were
removed (not deprecated). v2.4.x remains installable if you need the old API:
`pip install "flowiz<3"`.

## API changes

| v2 | v3 |
|---|---|
| `fz.read_flow(path)` → numpy array | `fz.read(path)` → `Flow` (`.data` is the array; accepts any format) |
| `fz.convert_from_file(path)` | `fz.colorize(fz.read(path))` |
| `fz.convert_from_flow(arr)` | `fz.colorize(arr)` |
| `fz.convert_from_flow(arr, mode='UV')` | `fz.flow_to_uv(arr)` |
| `fz.convert_files(files, outdir=...)` | `fz.convert_files(files, outdir, mode=..., workers=...)` (same name, richer) |
| `fz.flowiz` submodule internals | `fz.core` (pure funcs), `fz.io` (readers) |

### Common snippets

```python
# v2
import flowiz as fz
img = fz.convert_from_file("frame.flo")

# v3
import flowiz as fz
img = fz.colorize(fz.read("frame.flo"))
```

```python
# v2 — U/V split
uv = fz.convert_from_flow(arr, mode='UV')

# v3
uv = fz.flow_to_uv(arr)
```

## CLI changes

The flat `python -m flowiz demo/*.flo -o out/ -v vid/` interface is replaced by
subcommands:

| v2 | v3 |
|---|---|
| `python -m flowiz *.flo -o out/` | `flowiz convert '*.flo' -o out/` |
| `python -m flowiz *.flo -o out -v vid -r 24` | `flowiz video '*.flo' -o vid/flow.mp4 -r 24` |
| — | `flowiz info`, `flowiz compare`, `flowiz view` (new) |

`flowiz` is now a proper console entry point; `python -m flowiz` still works as
an alias.

## Behavioral improvements you get for free

- **No input mutation.** v2 zeroed unknown pixels in your array in place; v3 copies.
- **Flicker-free video.** `flowiz video` normalizes by the whole-sequence max by
  default (`--normalize sequence`). Pass `--normalize frame` for the old behavior.
- **Invalid pixels rendered.** NaN / sentinel / masked pixels are drawn black.
- **No ffmpeg install required.** Video encoding uses the bundled `imageio-ffmpeg`.
- **New formats.** KITTI 16-bit PNG, PFM, `.npy/.npz`, Spring `.flo5`, torch tensors.

## Removed

- The Eel/Materialize desktop GUI and its Docker image. Use the browser viewer at
  <https://georgegach.github.io/flowiz/> or `flowiz view` instead.
