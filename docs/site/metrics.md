# Metrics & comparison

## End-point error

```python
result = fz.epe(pred, gt)
result.mean, result.median, result.p90    # over valid pixels
result.per_pixel                          # (H, W) EPE map
result.valid_fraction
```

## KITTI Fl-score

```python
fl = fz.fl_score(pred, gt)   # % of outliers (EPE > 3px AND > 5% of GT magnitude)
```

## Error map

```python
heat = fz.error_map(pred, gt)             # (H, W, 3) uint8 magma heatmap
heat = fz.error_map(pred, gt, max_epe=5)  # fixed scale for comparability
```

## Paper figure in one call

```python
fig = fz.compare_grid(pred, gt, save="figure.png")
```

Produces a labeled `prediction | ground truth | EPE` panel with a shared color
normalization and the EPE / Fl-score in the title — drop it straight into a paper.
