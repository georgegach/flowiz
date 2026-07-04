# CLI reference

flowiz installs a `flowiz` console command. `python -m flowiz` is an alias.

## `flowiz convert`

Convert flow files to PNG images.

```bash
flowiz convert 'flows/*.flo' -o out/ --workers 8 --mode rgb
```

- `--outdir, -o` — output directory (default: alongside each input)
- `--mode, -m` — `rgb` | `uv` | `mag` | `angle`
- `--workers, -w` — parallel processes

## `flowiz video`

Compile a temporally consistent video.

```bash
flowiz video 'flows/*.flo' -o flow.mp4 -r 24 --normalize sequence
```

- `--output, -o` — `.mp4` / `.webm` / `.gif`
- `--fps, -r` — frames per second
- `--normalize, -n` — `sequence` (default) or `frame`
- `--max-flow` — fixed normalizer

## `flowiz info`

```bash
flowiz info frame_0001.flo
```

## `flowiz compare`

```bash
flowiz compare pred.flo gt.flo --save grid.png
```

## `flowiz view`

Open the bundled offline browser viewer.

```bash
flowiz view --port 8000
```
