# Poverty neural network activation sweep (PyTorch)

## What was run
- Script: `scripts/06_poverty_nn_activation_sweep.py`
- Data: `data/processed/panel/marz_year_panel_full.csv` (2008–2024; lag features computed in-script)
- Split:
  - Train: years `< 2020` (i.e., 2009–2019 after lagging)
  - Validation (early stopping): year `== 2020`
  - Test: years `>= 2021`
- Baseline: `poverty_lag1` (predict \(poverty\_rate_t\) using \(poverty\_rate_{t-1}\))
- Metrics reported on the **test** years: R² / MSE / MAE

## Results (best models)
Saved full sweep table to: `data/processed/results/poverty_nn_activation_sweep.csv`

Top results:

1. **Baseline (`poverty_lag1`)**
   - R² = **0.7279**
   - MSE = 45.94
   - MAE = 5.11

2. **Best MLP (among tested activations/architectures)**
   - Activation: **ELU**
   - Hidden dims: **64x32**
   - R² = 0.5429
   - MSE = 77.15
   - MAE = 6.70

## Takeaway
On this dataset + time split, **none of the tested MLP variants beat the lag baseline**; the best NN configuration was **ELU(64x32)**, but it still underperformed the baseline.

## Re-run
From the repo root:

```bash
python3 scripts/06_poverty_nn_activation_sweep.py
```

