# BOCPD Dashboard

> Bayesian Online Changepoint Detection for financial time series — interactive dashboard built on React + Recharts with a live Python API backend.

---

## Overview

This dashboard implements **BOCPD** (Adams & MacKay, 2007) on daily log-returns of any equity ticker. The algorithm maintains an exact online posterior over *run lengths* — the number of trading days elapsed since the last regime change — and raises a signal whenever that posterior concentrates near zero.

The frontend visualises three linked panels (price, signal, run-length) that all respond to a shared brush, and a live sidebar that follows your cursor across the chart to show point-in-time statistics.

---

## How it works

### The model

At each time step $t$ the algorithm tracks a distribution over the current run length $r_t$:

$$P(r_t \mid x_{1:t}) \propto \sum_{r_{t-1}} P(x_t \mid \mathcal{D}_t^{(r)}) \cdot P(r_t \mid r_{t-1}) \cdot P(r_{t-1} \mid x_{1:t-1})$$

**Likelihood** — Student-T with Normal-Gamma conjugate prior on log-returns.  
Parameters $(\mu, \kappa, \alpha, \beta)$ are updated analytically each step so no sampling is needed.

**Hazard function** — constant rate $H = 1/\lambda$. Each day, any run independently has probability $1/\lambda$ of ending.

**Signal** — `short_run_prob` $= P(r_t < 10 \mid x_{1:t})$: the posterior mass on very short runs. When this exceeds the detection threshold a changepoint is declared.

**Run-length map** — $\text{argmax}_r\, P(r_t = r \mid x_{1:t})$: the most probable run length at each date, displayed in the bottom panel. It rises linearly during stable regimes and drops to zero at each changepoint.

### Parameters

| Parameter | Symbol | Meaning | Typical range |
|-----------|--------|---------|---------------|
| Lambda | $\lambda$ | Expected trading days between changepoints | 50 – 500 |
| Threshold | — | Minimum `short_run_prob` to declare a changepoint | 0.7 – 0.95 |

---

## Dashboard layout

```
┌─────────────────────────────────────────────────────┬────────────┐
│  Control bar  (ticker · date range · λ · threshold) │            │
├─────────────────────────────────────────────────────┤            │
│                                                     │  Cursor /  │
│   Price chart — segments colored by regime          │  Brush end │
│   Red dashed lines = detected changepoints          │            │
│   Brush to zoom ────────────────────────────────── │  Price     │
│                                                     │  CP Signal │
│   Changepoint signal (short_run_prob)               │  Last CP   │
│   ── amber area ── threshold line ─────────────────│  Run Len   │
│                                                     ├────────────┤
│   Run-length argmax(t)                              │  Segment   │
│                                                     │  stats     │
└─────────────────────────────────────────────────────┴────────────┘
```

**Cursor tracking** — hover anywhere on the price chart and the entire sidebar updates to show values at that exact date. Move the mouse away and it reverts to the brush end date.

**Brush zoom** — drag the minimap at the bottom of the price chart. The signal and run-length panels zoom in sync.

**Segment legend** — each detected regime gets a distinct color (up to 12), shown as swatches in the header and as a vertical bar in the segment table.

---

## Project structure

```
spy-bocpd-dashboard/
├── scripts/
│   ├── server.py          # Flask API — runs BOCPD on demand, serves JSON
│   └── export_data.py     # One-shot export to src/data/bocpd_data.json
├── src/
│   ├── components/
│   │   ├── PriceChangepointTimeline.tsx   # Three-panel main chart
│   │   ├── KPIBar.tsx                     # Cursor-tracked sidebar metrics
│   │   ├── SegmentStatsPanel.tsx          # Per-regime return / volatility table
│   │   ├── ControlBar.tsx                 # Ticker · dates · λ · threshold
│   │   └── InfoTooltip.tsx                # Portal-based hover tooltip
│   ├── hooks/
│   │   └── useBOCPDData.ts                # Fetch from API, fallback to static JSON
│   ├── types/
│   │   └── bocpd.ts                       # Shared TypeScript interfaces
│   └── App.tsx
├── tailwind.config.ts
└── vite.config.ts
```

---

## Quick start

### 1 — Python backend

```bash
# Create a virtual environment (recommended)
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install flask numpy scipy yfinance

# Start the API server on port 8765
python scripts/server.py
```

The server exposes one endpoint:

```
GET http://localhost:8765/bocpd
    ?ticker=SPY
    &start=2016-01-01
    &end=2026-04-14
    &lambda=250
    &threshold=0.8
```

### 2 — React frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Type any ticker, adjust the date range and parameters, and click **Apply**. The backend runs BOCPD (~5–30 s depending on range) and streams the result back.

> **No backend?**  The app loads `src/data/bocpd_data.json` on startup so the charts are never empty. Run `python scripts/export_data.py` to regenerate that file with fresh data.

---

## API response schema

```jsonc
{
  "metadata": {
    "ticker": "SPY",
    "lambda": 250,
    "threshold": 0.8,
    "n_changepoints": 11,
    "last_close": 564.89,
    "day_change": 3.21,
    "day_pct": 0.0057,
    "last_updated": "2026-04-14"
  },
  "prices":         [{ "date": "2016-01-05", "close": 201.34 }],
  "short_run_prob": [{ "date": "2016-01-05", "prob": 0.021 }],
  "changepoints":   [{ "date": "2020-02-24", "index": 1053 }],
  "regime_segments": [{
    "id": 0, "start": "2016-01-05", "end": "2016-01-14",
    "n_days": 10, "mean_return_annual": 0.12, "std_annual": 0.18
  }],
  "run_length_map": [{ "date": "2016-01-05", "run_length": 1 }]
}
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Language model | Python 3.10+ |
| BOCPD algorithm | NumPy · SciPy (Student-T pdf) |
| Market data | yfinance |
| API server | Flask |
| Frontend | React 18 · TypeScript · Vite |
| Charts | Recharts 2 |
| Styling | Tailwind CSS v3 · Inter · JetBrains Mono |

---

## Reference

Adams, R. P., & MacKay, D. J. C. (2007). **Bayesian Online Changepoint Detection.** *arXiv:0710.3742*.

```
@article{adams2007bocpd,
  author  = {Adams, Ryan Prescott and MacKay, David J. C.},
  title   = {Bayesian Online Changepoint Detection},
  journal = {arXiv preprint arXiv:0710.3742},
  year    = {2007}
}
```
