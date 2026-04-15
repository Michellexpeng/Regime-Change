# HMM Regime Detection — Design Spec
**Date:** 2026-04-14  
**Project:** Bayesian Regime Change Detection (ADSP 2025 Autumn)

---

## Goal

Add a Hidden Markov Model (HMM) approach alongside the existing BOCPD method for financial regime detection, then integrate both into the visualization dashboard with a method switcher.

---

## Architecture

Four sequential phases, each independently deliverable:

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| 1a | `change_point_detect_px.ipynb` (existing BOCPD) | — (done) |
| 1b | `hmm_standalone.ipynb` | — |
| 2 | `api/bocpd.py` + `api/hmm.py` | 1a + 1b both stable |
| 3 | `comparison.ipynb` | Phase 2 |
| 4 | `api/server.py` `/hmm` endpoint + frontend switcher | Phase 2 |

Notebooks cannot import from each other. Phase 2 extraction is the necessary bridge before comparison or dashboard work.

---

## Phase 1b — `hmm_standalone.ipynb`

All logic inline (no imports from local `.py` files). Cells:

1. **Data loading** — `yfinance`, same ticker/date range as BOCPD notebook, compute log returns
2. **HMM fitting** — `hmmlearn.GaussianHMM`, `n_components=3`, `covariance_type="full"`, fit on log returns
3. **State alignment** — sort states by mean return → label: lowest=bear, middle=neutral, highest=bull
4. **Output** — per-day state sequence, state transition matrix, per-state (μ, σ) annualized

**Key design decision:** State labels (bear/neutral/bull) are assigned post-hoc by ranking states on mean return. This must be reproduced identically in `api/hmm.py` to ensure notebook and API results match.

---

## Phase 2 — Python Module Extraction

### `api/bocpd.py`
- Extract `StudentT` class and `run_bocpd()` from `server.py`
- `server.py` imports and calls `run_bocpd()` — no behavior change

### `api/hmm.py`
- Extract HMM logic from `hmm_standalone.ipynb`
- Public interface: `run_hmm(ticker, start, end, n_states=3) -> dict`
- Output schema mirrors `run_bocpd()` where possible: `metadata`, `prices`, `regime_segments`, `changepoints`
- HMM-specific fields: `state_probs` (per-day posterior), `transition_matrix`, `state_params` (μ/σ per state)

### `api/utils.py` (optional)
- If data download + annualization logic is duplicated across both modules, extract to `utils.py`
- Only create if duplication is real, not speculative

---

## Phase 3 — `comparison.ipynb`

Imports `bocpd.py` and `hmm.py`. No inline algorithm logic.

### Outputs:
1. **Regime overlay plot** — price chart with BOCPD regime color band + HMM regime color band on same time axis (two subplots, aligned x-axis)
2. **Per-regime stats table** — for each method: regime label, date range, n_days, annualized μ, annualized σ
3. **Agreement metrics**:
   - Day-level agreement rate (% of days both methods assign same regime label)
   - Changepoint proximity (within N days)
   - Confusion matrix (BOCPD state vs HMM state)

---

## Phase 4 — Dashboard Integration

### API (`api/server.py`)
- Add `/hmm` endpoint, same parameter signature as `/bocpd`: `ticker`, `start`, `end`
- Returns HMM output schema from `api/hmm.py`
- Keep `/bocpd` endpoint unchanged

### Frontend (`spy-bocpd-dashboard`)
- Add method selector dropdown (BOCPD / HMM)
- On method change: re-fetch from `/bocpd` or `/hmm`, swap chart data
- Reuse existing chart components — no layout redesign needed
- HMM-only fields (`state_probs`, `transition_matrix`) shown only in HMM mode

---

## HMM Implementation Notes

- **Library:** `hmmlearn.GaussianHMM`
- **States:** 3 (`n_components=3`)
- **Covariance:** `"full"` (each state has its own covariance matrix)
- **Input:** log returns (same preprocessing as BOCPD)
- **State ordering:** sorted by per-state mean return, ascending → bear=0, neutral=1, bull=2
- **Changepoint definition for HMM:** days where `state[t] != state[t-1]`

---

## What's Out of Scope

- Automatic state number selection (AIC/BIC) — can be added later
- Regime-conditional portfolio metrics — out of scope for this iteration
- Side-by-side layout in dashboard — method switcher is sufficient
