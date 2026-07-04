# Visualization

## Color wheel (default)

```python
img = fz.colorize(flow)                       # per-frame max normalization
img = fz.colorize(flow, max_flow=20.0)        # fixed normalizer
img = fz.colorize(flow, legend=True)          # embed the color-wheel key
img = fz.colorize(flow, convention="hsv")     # alternative encoding
```

flowiz's color wheel is bit-compatible (±1 LSB) with the widely used `flow_vis`
package, so figures match across the literature. This is enforced by parity
tests against an independent reference implementation.

## Temporally consistent video

Per-frame normalization makes videos flicker. Normalize by the whole sequence:

```python
frames = fz.colorize_sequence(flows, max_flow="sequence")   # shared normalizer
```

`flowiz video` does this by default.

## Alternative encodings

```python
fz.flow_to_uv(flow)          # (H, W, 2) normalized u/v channels
fz.flow_to_magnitude(flow)   # magnitude heatmap (magma)
fz.flow_to_angle(flow)       # direction map (hue)
```

## Vector overlays

```python
img = fz.quiver(flow, step=16, scale=1.0)                 # arrows on the color map
img = fz.quiver(flow, background=my_rgb_frame, step=24)   # arrows on any image
```

## Color-wheel legend

```python
legend = fz.wheel_legend(128)   # (128, 128, 4) RGBA, transparent outside the disk
```
