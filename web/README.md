# Capstone Web App

Next.js frontend for the Armenia poverty, regional inequality, and forecasting platform.

The app combines:
- household-level ILCS 2015 analysis
- regional poverty / stress / infrastructure views
- model benchmarking and forecasting diagnostics
- interactive forecast timeline + choropleth for 2023–2026 projections

## Main Sections

### `/`
Editorial landing page with:
- project framing
- KPI summary
- entry points into regional, household, models, and explorer flows

### `/regional`
Regional atlas views for Armenian marzes:
- choropleth map
- rankings
- time-series comparisons

### `/household`
Household analysis workspace:
- overview KPIs
- column distributions
- feature explorer
- correlation heatmap
- t-SNE cluster scatter

### `/explorer`
Improved analytical table for the household dataset:
- income range filters
- household size filters
- interview month filter
- asset filters (`has_computer`, `household_has_car`)
- poverty benefit filter
- sortable columns
- CSV export

### `/models`
Model and forecasting views:
- model comparison
- feature importance
- forecasting results
- forecast timeline + map (`/models/forecast`)

## Forecast Experience

`/models/forecast` now includes:
- observed vs forecast timeline for poverty rate and stress index
- 95% confidence interval display
- map year slider for 2016–2026
- choropleth by marz
- comparison ledger under the map showing:
  - current value
  - previous available value
  - year-over-year delta
  - largest increase / decrease
  - highlighted region summary

This is designed to make year changes readable numerically, not just via color.

## Notable UI Improvements

Recent UI work includes:
- stronger civic/editorial homepage design
- improved hover and tooltip readability
- cleaner forecasting tables
- fixed t-SNE income decile ordering
- better explorer filter logic and table design
- more readable distribution markers and chart annotation behavior

## Data + API Sources

Key API routes:
- `src/app/api/households/list/route.ts`
- `src/app/api/households/distribution/route.ts`
- `src/app/api/households/scatter/route.ts`
- `src/app/api/households/tsne/route.ts`
- `src/app/api/models/forecasting/route.ts`
- `src/app/api/models/importance/route.ts`
- `src/app/api/models/metrics/route.ts`
- `src/app/api/forecast/route.ts`
- `src/app/api/regional/choropleth/route.ts`
- `src/app/api/regional/panel/route.ts`
- `src/app/api/regional/ranking/route.ts`

Important shared app files:
- `src/lib/db.ts`
- `src/lib/constants.ts`
- `src/lib/utils.ts`
- `src/components/charts/*`
- `src/components/layout/*`

Important upstream data files used by the app:
- `../data/processed/results/forecast_2023_2026.csv`
- `../data/processed/results/ts_classical_results.csv`
- `../data/processed/results/ts_nn_results.csv`
- `../data/processed/results/poverty_nn_activation_sweep.csv`
- `../data/processed/results/poverty_nn_layer_size_sweep.csv`
- `../data/processed/panel/*`

## Development

From `web/`:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Production check:

```bash
npm run build
```

## Notes

- The web app depends on seeded Postgres tables for most household/regional/model pages.
- Some forecasting views also read result CSVs directly from `../data/processed/results/`.
- Forecasting pages distinguish between observed historical data and projected values, but interpretation still depends on the underlying data-generation process documented elsewhere in the repo.
