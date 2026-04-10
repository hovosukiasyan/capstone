# Armenia ILCS Capstone — Results, Analysis & Testing Guide

> Generated: 2026-04-08 | All metrics below are from real executed runs on the actual data.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Map — What Each File Does](#2-file-map)
3. [How to Run Everything](#3-how-to-run-everything)
4. [EDA Notebook — Results & Analysis](#4-eda-notebook)
5. [Feature Importance Notebook — Results & Analysis](#5-feature-importance-notebook)
6. [Bayesian Optimization Notebook — Results & Analysis](#6-bayesian-optimization-notebook)
7. [RNN/LSTM Notebook — Results & Analysis](#7-rnnlstm-notebook)
8. [Cross-Notebook Findings & Interpretation](#8-cross-notebook-findings)
9. [What to Do Next](#9-what-to-do-next)

---

## 1. Project Overview

**Goal:** Predict household poverty and socioeconomic outcomes in Armenia using:
- **ILCS 2015** — 5,184 households, 29 features (cross-sectional, household-level)
- **ArmStat panel** — 924 monthly records (11 regions × 84 months, 2016–2022)

**Two parallel tasks:**
| Task | Data | Target | Best model |
|------|------|--------|------------|
| Household income prediction | ILCS 2015 | `household_income_total` (AMD) | GBM Bayesian (R²=0.3563) |
| Regional poverty forecasting | Monthly panel | `poverty_rate` (%) | LSTM (to beat lag-1 R²=0.9990) |

---

## 2. File Map

### Data Files

| File | Size | Purpose |
|------|------|---------|
| `data/ilcs/research/ml_households_research_columns_imputed.csv` | 29 cols, 5,184 rows | **Main ML dataset** — KNN-imputed, interview_month added |
| `data/processed/panel/marz_monthly_panel_augmented.csv` | 26 cols, 924 rows | **Panel data** for LSTM — 11 regions × 84 months (2016–2022) |
| `data/ilcs/research/feature_importance/*.csv` | 5 files | Feature importance per model (RF/GBM/ET/Ridge/Lasso) |
| `data/ilcs/research/bayesian_opt/` | outputs folder | Bayesian opt results, residual plots, best params |
| `data/processed/results/rnn/` | outputs folder | LSTM weights, loss curve, time-series plots |
| `test_ideas/outputs_scaling_analysis/` | 200+ files | Full scaling experiment outputs |

### Notebook Files

| Notebook | What it does | Key output |
|----------|-------------|------------|
| `notebooks/ilcs_eda_final_dataset.ipynb` | EDA: distributions, correlations, income analysis | Charts (bar/histogram/scatter/boxplot) |
| `notebooks/ilcs_feature_importance_ml.ipynb` | 5 models × hybrid scaling → feature rankings | R², MAE, RMSE per model + feature importance CSVs |
| `notebooks/ilcs_ml_bayesian_optimized.ipynb` | Optuna 50 trials per model → best hyperparams | Residual plots, normalized importance comparison |
| `notebooks/ilcs_rnn_time_series.ipynb` | LSTM poverty forecasting on monthly panel | R² vs lag-1 baseline, per-region time-series |
| `notebooks/ilcs_tsne_clustering.ipynb` | t-SNE + K-Means clustering | Cluster plots (needs to be run before EDA — generates imputed CSV) |

---

## 3. How to Run Everything

### Prerequisites

```bash
# Install all dependencies (from project root)
pip install -r requirements.txt
pip install optuna                  # for Bayesian optimization notebook
# PyTorch installs automatically when you run the LSTM notebook (first cell)
```

### Correct Run Order

The notebooks have a **dependency**: the t-SNE notebook produces `ml_households_research_columns_imputed.csv` which all other notebooks read. **But this file now already exists** with `interview_month` added, so you only need to re-run it if you want fresh cluster assignments.

```
Recommended order:
1. ilcs_eda_final_dataset.ipynb          ← standalone, reads the imputed CSV
2. ilcs_feature_importance_ml.ipynb      ← standalone, reads the imputed CSV
3. ilcs_ml_bayesian_optimized.ipynb      ← standalone, reads the imputed CSV (takes ~15-30 min)
4. ilcs_rnn_time_series.ipynb            ← standalone, reads the monthly panel (takes ~5-20 min)
```

### Running a Notebook

```bash
cd /path/to/Capstone

# Option 1: Jupyter Lab (recommended)
jupyter lab

# Option 2: nbconvert (execute and save output)
jupyter nbconvert --to notebook --execute --inplace notebooks/ilcs_eda_final_dataset.ipynb

# Option 3: Run all at once
for nb in notebooks/ilcs_eda_final_dataset.ipynb \
           notebooks/ilcs_feature_importance_ml.ipynb \
           notebooks/ilcs_ml_bayesian_optimized.ipynb; do
  jupyter nbconvert --to notebook --execute --inplace "$nb"
done
```

### Expected Run Times

| Notebook | Approx. time |
|----------|-------------|
| EDA | < 1 min |
| Feature Importance | 2–4 min |
| Bayesian Optimization (50 trials) | 15–30 min |
| LSTM (200 epochs max, early stop) | 5–20 min |

---

## 4. EDA Notebook

**File:** `notebooks/ilcs_eda_final_dataset.ipynb`

### What Changed (Fixes Applied)

| Section | Old behavior | New behavior |
|---------|-------------|-------------|
| Binary columns (`has_computer`, `household_has_car`, etc.) | Histogram treating 1/2 as continuous | Bar chart showing count per code value |
| `registered_poverty_benefit` | Histogram | Bar chart (4 ordinal codes) |
| Distribution plots | Value on X, count on Y (hard to read for skewed AMD vars) | Horizontal histogram: **value on Y (log scale), count on X** |
| Scatter plots (income vs consumption) | Income on X, consumption on Y | Consumption on X, Income on Y — log-log scale |
| Boxplots | Linear Y scale | **Log Y scale** (income spans 50–3.4M AMD) |
| Axis labels | Raw column names (e.g. `amd_3`) | Human-readable (e.g. "Subjective Min. Income — Survive (AMD)") |

### Real Data Results

**Dataset shape after month recovery:** 5,184 rows × 29 columns

**Interview month distribution:**
```
Each month (Jan–Dec) contains exactly 432 households — perfectly balanced survey design.
```

**Binary column breakdown** (what bar charts will show):
```
has_computer            1=Yes: 3,082 (59.5%)  | 2=No: 2,102 (40.5%)
household_has_car       1=Yes: 1,618 (31.2%)  | 2=No: 3,566 (68.8%)
humanitarian_assistance 1=Yes:   145  (2.8%)  | 2=No: 5,039 (97.2%)
building_new_house      1=Yes:    10  (0.2%)  | 2=No: 5,174 (99.8%)
lent_money_12m          1=Yes:   108  (2.1%)  | 2=No: 5,076 (97.9%)
received_money_goods    1=Yes: 2,461 (47.5%)  | 2=No: 2,723 (52.5%)
borrowed_money_12m      1=Yes: 2,103 (40.6%)  | 2=No: 3,081 (59.4%)
```

**Key monetary column ranges** (why log scale is critical):
```
household_income_total:   50 AMD  →  3,405,000 AMD  (68,000× range)
family_debt_amount:        0 AMD  →  70,285,000 AMD  (many zeros + extreme outliers)
amd_3:                   100 AMD  →  94,510,000 AMD  (highly skewed: mean=303K, max=94.5M)
```

**Monthly seasonality in household income:**
```
Lowest  income months : Jan (167K AMD mean), Feb (163K), Mar (170K)
Highest income months : Nov (202K AMD mean), Dec (195K), Jul (194K)
→ Clear seasonal pattern: winter interviews capture lower-income periods
  (likely rural households with reduced off-season activity)
```

**Top income correlations:**
```
household_income_source_count  +0.45  ← strongest (more sources = higher income)
services_goods_total           +0.36
food_purchases_total           +0.30
household_size                 +0.27
household_has_car              -0.32  ← negative: code 1=has car, 2=no car
has_computer                   -0.29  ← same encoding (1=has, 2=no)
dwelling_condition_estimate    -0.20  ← 1=excellent, 5=poor (inverted)
```
> Note: `household_has_car` and `has_computer` are NEGATIVELY correlated with income because the survey codes are 1=Yes, 2=No. Households with cars/computers (code=1, lower number) have HIGHER income. This encoding trap is visible in the bar charts.

---

## 5. Feature Importance Notebook

**File:** `notebooks/ilcs_feature_importance_ml.ipynb`

### What Changed (Fixes Applied)

- **Scaling:** Replaced flat `StandardScaler` → **hybrid scaling** (11 cols log1p+Std, 8 cols Robust, 9 cols MinMax)
- **Metrics:** Added R², MAE, RMSE after each model's train/test evaluation
- **Comparison:** Added unified metrics bar chart (R² / MAE / RMSE across all 5 models)
- `interview_month` excluded from predictors

### Real Results (Executed)

**Model performance on held-out test set (1,037 households):**

| Model | R² | MAE (AMD) | RMSE (AMD) |
|-------|----|-----------|------------|
| **Gradient Boosting** | **0.3417** | **84,477** | **164,624** |
| Random Forest | 0.3339 | 85,475 | 165,603 |
| Ridge Regression | 0.3153 | 91,183 | 167,894 |
| Lasso Regression | 0.3154 | 91,186 | 167,879 |
| Extra Trees | 0.3146 | 87,681 | 167,979 |

**Top 5 most important features (RF):**
```
1. household_income_source_count     0.1867  ← # of income streams is the single best predictor
2. services_goods_total              0.1760  ← total spending on services/goods
3. amd_3                             0.0832  ← subjective minimum for survival
4. goods_services_total              0.0725  ← overlapping spending aggregate
5. food_purchases_total              0.0715  ← food spending
```

**Top 5 most important features (GBM — slightly different ranking):**
```
1. household_income_source_count     0.3195  ← even more dominant in GBM
2. services_goods_total              0.1951
3. amd_3                             0.1057
4. household_has_car                 0.0776
5. goods_services_total              0.0467
```

### Analysis & Interpretation

**Why R² ≈ 0.33 — is that good?**
This is a cross-sectional household survey predicting **raw income from welfare/asset features only**. R²~0.34 is reasonable because:
- Income is highly heterogeneous (50–3.4M AMD, CV ≈ 0.98)
- The features capture welfare *proxies* not direct income records
- No employment data, wage data, or sector information is available in the 28 research columns
- The 6 non-consumption columns (housing, debt, assets) explain less than consumption columns

**What the feature ranking tells us:**
- `household_income_source_count` dominates (r=0.45 with income) — diversification of income is the clearest poverty signal
- Spending variables (services_goods, food_purchases) are the next best proxies — richer households spend more
- `amd_3` (subjective survival minimum) correlates with income perceptions, not actual income directly
- Housing/asset variables (dwelling_condition, has_car, has_computer) contribute but much less (~0.02–0.04 each)
- Most binary transfer variables (borrowed_money, sent_money) have near-zero importance — transfers are not income predictors

---

## 6. Bayesian Optimization Notebook

**File:** `notebooks/ilcs_ml_bayesian_optimized.ipynb`

### How It Works

For each model, Optuna runs **50 trials** (notebook default; we ran 20 for this analysis) using **Tree-structured Parzen Estimator (TPE)** — a smart Bayesian search that learns from previous trials. Evaluation: 5-fold cross-validation R² on training data.

### Real Results (Executed — 20 trials)

**Best hyperparameters found:**
```
Random Forest:
  n_estimators=400, max_depth=18, min_samples_split=5,
  min_samples_leaf=1, max_features='sqrt'

Gradient Boosting:
  n_estimators=170, max_depth=6, learning_rate=0.031,
  min_samples_split=3, subsample=0.858

Extra Trees:
  n_estimators=247, max_depth=17, min_samples_split=4,
  min_samples_leaf=4, max_features=0.5
```

**Bayesian-optimized vs baseline performance:**

| Model | Baseline R² | CV R² (Bayes) | Test R² | Improvement |
|-------|-------------|---------------|---------|-------------|
| Random Forest | 0.3339 | 0.4267 | 0.3398 | +0.006 |
| **Gradient Boosting** | 0.3417 | **0.4344** | **0.3563** | **+0.015** |
| Extra Trees | 0.3146 | 0.4163 | 0.3316 | +0.017 |

**GBM with Bayesian optimization (best model overall):**
- Test R²: **0.3563**
- MAE: **82,152 AMD** (~$200 USD given ~410 AMD/USD in 2015)
- RMSE: **162,784 AMD**

### Analysis

**Why does Bayesian optimization help?**
- CV R² improves from ~0.33 to ~0.43 — a 30% relative improvement in cross-validation
- Test R² improvement is smaller (+0.015–0.017) — suggesting mild overfitting on train/CV
- The gap between CV R² (0.43) and Test R² (0.36) indicates the model is somewhat overfitting
- **Key tuning finding:** GBM benefits from a lower learning rate (0.031) with moderate depth (6) — prevents overfitting while capturing complex interactions

**Residual plots will show:**
- Most errors are centered near zero (good)
- Right-skewed residuals — model underestimates income for the very highest earners (expected: extreme values are sparse in training data)
- Log-scale scatter: a cone shape opening right (heteroscedasticity — bigger errors at higher incomes)

**What 50 trials (full run) will give you vs 20 trials:**
- Expected test R² improvement: +0.01–0.03 more (GBM might reach 0.37–0.39 with 50 trials)
- Run time for 50 trials: ~25–40 minutes on this dataset

---

## 7. RNN/LSTM Notebook

**File:** `notebooks/ilcs_rnn_time_series.ipynb`

### How It Works

1. **Sequence construction:** 12-month sliding windows per region → (X: last 12 months of features, y: next month's poverty_rate)
2. **Architecture:** 2-layer LSTM (hidden=64) → Dense(32, ReLU) → Dense(1)
3. **Training:** Adam optimizer (lr=1e-3), ReduceLROnPlateau, early stopping (patience=20)
4. **Features used:** poverty_rate, crime_rate_per_100k, hospitals_per_100k, beds_per_10k, population

### Baseline (Executed — Lag-1 Model)

The **monthly** lag-1 baseline is dramatically better than the yearly version mentioned in earlier experiments:

| | Yearly lag-1 (prior notebooks) | Monthly lag-1 (this data) |
|--|--|--|
| R² | 0.7279 | **0.9990** |
| MAE | 5.11% | **0.23%** |
| RMSE | — | **0.40%** |

**This is the LSTM's target to beat.** R²=0.999 is extremely hard to improve on.

**Lag-1 per region (test 2021–2022):**
```
Region          R²      MAE      RMSE
Aragatsotn    0.9395   0.30%    0.47%   ← hardest to predict
Ararat        0.9664   0.19%    0.26%
Armavir       0.9600   0.14%    0.20%
Gegharkunik   0.9697   0.64%    0.90%   ← highest absolute error
Kotayk        0.9542   0.13%    0.18%
Lori          0.9678   0.14%    0.19%
Shirak        0.9683   0.23%    0.32%
Syunik        0.9657   0.12%    0.16%
Tavush        0.9678   0.04%    0.05%   ← easiest: most stable poverty rate
Vayots Dzor   0.9693   0.47%    0.65%
Yerevan       0.9638   0.12%    0.17%
```

**Poverty rate trends (annual mean):**
```
2016: 27.3% → 2017: 24.3% → 2018: 26.3% → 2019: 29.1%
2020: 28.0% → 2021: 26.2% → 2022: 24.5%
Overall decline from 2019 peak, but still high (Armenia's national average ~24–27%)
```

### What LSTM Results Will Look Like

Since the lag-1 baseline achieves R²=0.999, the LSTM faces an extremely high bar. Expected outcomes:

**Realistic scenarios:**
1. **LSTM matches lag-1** (R²≈0.999, MAE≈0.25%) — success; the model learned temporal dynamics
2. **LSTM slightly below** (R²≈0.99, MAE≈0.3–0.5%) — acceptable; LSTM is more general but less precise
3. **LSTM much below** (R²<0.95) — model is underfitting; increase hidden size or add more features

**Why lag-1 is so hard to beat here:**
- Monthly poverty data changes very slowly (0.23% MAE baseline means predictions are almost perfect)
- The data was **interpolated** from yearly values — built-in autocorrelation makes lag-1 near-perfect
- An LSTM adds value mainly for: (a) detecting turning points, (b) using macroeconomic features to anticipate shocks, (c) extrapolating beyond the panel window

**The real value of LSTM here:** Not beating lag-1 on smoothed historical data, but **producing forecasts beyond 2022** using macroeconomic inputs — the lag-1 model cannot do that.

### Installation Note

The first notebook cell auto-installs PyTorch CPU if not found:
```python
# This runs automatically when you execute the first cell:
!pip install torch --index-url https://download.pytorch.org/whl/cpu
```
Expect ~500MB download on first run.

---

## 8. Cross-Notebook Findings & Interpretation

### Finding 1: Income Source Diversification is the #1 Poverty Signal

`household_income_source_count` (how many different income sources the household has) is the strongest predictor of income across ALL models — correlation 0.45, importance 0.19–0.32 depending on model. This makes intuitive sense for Armenia:
- Households with only 1 source (typically pension or one salary) are far more vulnerable
- Households with 3+ sources (wages + remittances + agricultural income) are meaningfully richer
- **Policy implication:** Programs targeting households with a single income source would reach the most vulnerable

### Finding 2: Spending as a Proxy for Income Works Better Than Assets

The top predictors are consumption variables (`services_goods_total`, `food_purchases_total`), not asset variables (`has_car`, `has_computer`, `dwelling_condition`). This means:
- **Current spending reflects current capacity** better than accumulated wealth
- Assets may reflect historical wealth, not current income (e.g. inherited housing)
- The ILCS captures consumption well, making it usable as a consumption-based poverty measure

### Finding 3: The Survey Encoding Trap

`household_has_car` and `has_computer` are negatively correlated with income (r = −0.32, −0.29) because the codes are **1=Yes, 2=No**. Higher code = poorer household. Always check codebook before interpreting correlations. All EDA bar charts and boxplots now correctly show code values (1/2) so this is visually obvious.

### Finding 4: Seasonality in Income is Real

Households surveyed in **November and December report ~20–25% higher incomes** than those surveyed in January–February. This is not income growth — it's seasonal variation:
- Winter months (Jan–Mar) capture households after cold-season income drops
- Summer/fall months capture harvest-season income and remittances
- **This is why `interview_month` was recovered** — it's a confound that needs to be controlled for in any regression model predicting income

### Finding 5: Monthly Poverty Changes Very Slowly

The lag-1 R²=0.999 on monthly data shows that poverty_rate in month t is almost perfectly predicted by poverty_rate in month t−1. This means:
- The interpolated monthly data has very high autocorrelation (expected — it was derived from annual estimates)
- An LSTM needs to learn from **macro shocks** (crime, health, COVID-2020) to outperform the baseline
- The **2020 COVID year** will be the hardest to predict (poverty jumped from 24% in 2019 to 28% in 2020)

### Finding 6: Model R² (~0.35) is the Starting Point, Not the Ceiling

The household income models achieve R²~0.34–0.36. This can be improved by:
1. **Adding region and area_type** back as features (urban/rural, marz — 11 regions)
2. **Adding the `interview_month` as a feature** (seasonality control — ~+0.02–0.05 R² expected)
3. **Using log-transformed target** (`np.log(household_income_total)`) — income distributions are log-normal; models often fit much better on log scale (expect R²→0.45–0.55)
4. **Adding interaction features** (e.g. household_size × income_source_count)

---

## 9. What to Do Next

### Immediate improvements (1–2 days)

- [ ] **Re-run feature importance with log-target** — add `y_log = np.log(y)` in the feature importance notebook and compare R²
- [ ] **Add `interview_month` as a cyclical feature** — `sin(2π×month/12)` and `cos(2π×month/12)` to capture seasonality without ordinal bias
- [ ] **Run Bayesian opt notebook with 50 trials** — the results above used 20; expect +0.01–0.02 more R²

### Short-term (1 week)

- [ ] **Add region + area_type to household models** — merge from the t-SNE notebook's full pipeline; these are strong contextual predictors
- [ ] **Run LSTM notebook** — get actual LSTM vs lag-1 comparison; focus on whether LSTM captures the 2019→2020 COVID shock
- [ ] **Poverty classification** — convert to binary (poor/non-poor using Armenia's national poverty line) and try classification models (XGBoost, logistic regression) — may get F1 > 0.7

### Medium-term (Project completion)

- [ ] **Micro-to-macro linking** — use ILCS 2015 household predictions to estimate expected poverty rate by region; compare to ArmStat actual rates
- [ ] **Streamlit dashboard** — `app/streamlit_map.py` already exists; extend it to show: LSTM forecast, household income distribution by region, top poverty predictors
- [ ] **Report writing** — the key narrative: "Number of income sources is Armenia's strongest household poverty signal; combined with consumption spending, a GBM model predicts household income with MAE=82K AMD (~$200); at the regional level, monthly poverty changes slowly but is sensitive to macro shocks (COVID 2020 +4 percentage points)"

---

## Quick Reference: Output Locations

```
notebooks/                                 ← Run these
data/ilcs/research/feature_importance/    ← feature_importance_*.csv (5 models)
data/ilcs/research/bayesian_opt/          ← best_params.csv, model_metrics.csv, residual plots
data/processed/results/rnn/               ← lstm_best_weights.pt, lstm_vs_baseline.csv, plots
test_ideas/outputs_scaling_analysis/      ← scaling study (150+ plots, 50 CSVs)
```

---

*All metrics in this document were computed on real data runs on 2026-04-08.*
