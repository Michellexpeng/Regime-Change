# HMM Regime Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-state Gaussian HMM alongside BOCPD for financial regime detection, with a comparison notebook and dashboard method switcher.

**Architecture:** Phase 1b produces a standalone HMM notebook (all logic inline). Phase 2 extracts both methods into importable Python modules. Phase 3 builds a comparison notebook that imports those modules. Phase 4 exposes HMM via the Flask API and adds a method selector to the React dashboard.

**Tech Stack:** Python 3, hmmlearn, numpy, scipy, yfinance, Flask, React + TypeScript + Vite, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `hmm_standalone.ipynb` | Create | Standalone HMM experiment notebook |
| `api/bocpd.py` | Create | Extracted StudentT + run_bocpd() |
| `api/hmm.py` | Create | GaussianHMM wrapper run_hmm() |
| `api/server.py` | Modify | Import bocpd.py; add /hmm endpoint |
| `api/requirements.txt` | Modify | Add hmmlearn |
| `api/tests/test_bocpd.py` | Create | Unit tests for bocpd.py |
| `api/tests/test_hmm.py` | Create | Unit tests for hmm.py |
| `comparison.ipynb` | Create | Cross-method analysis notebook |
| `spy-bocpd-dashboard/src/types/hmm.ts` | Create | HMMData TypeScript type |
| `spy-bocpd-dashboard/src/hooks/useHMMData.ts` | Create | React hook for /hmm endpoint |
| `spy-bocpd-dashboard/src/components/ControlBar.tsx` | Modify | Add method selector, hide BOCPD-only params in HMM mode |
| `spy-bocpd-dashboard/src/App.tsx` | Modify | Conditionally use BOCPD or HMM data |

---

## Task 1: `hmm_standalone.ipynb` — Data Loading + Preprocessing

**Files:**
- Create: `hmm_standalone.ipynb`

- [ ] **Step 1: Create notebook and add Cell 1 — imports**

```python
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import yfinance as yf
from hmmlearn.hmm import GaussianHMM

plt.style.use('seaborn-v0_8-darkgrid')
```

- [ ] **Step 2: Add Cell 2 — data loading**

```python
TICKER = "SPY"
START  = "2016-01-01"
END    = "2026-04-14"

raw = yf.download(TICKER, start=START, end=END, auto_adjust=True, progress=False)
close = raw["Close"].squeeze().dropna()
log_returns = np.log(close).diff().dropna()

dates   = log_returns.index
returns = log_returns.values.reshape(-1, 1)   # hmmlearn expects (T, n_features)

print(f"Loaded {len(returns)} trading days: {dates[0].date()} → {dates[-1].date()}")
```

Run cell. Expected: `Loaded ~2XXX trading days: 2016-01-04 → ...`

- [ ] **Step 3: Commit**

```bash
git add "hmm_standalone.ipynb"
git commit -m "feat: add hmm_standalone notebook skeleton with data loading"
```

---

## Task 2: `hmm_standalone.ipynb` — HMM Fitting + State Alignment

**Files:**
- Modify: `hmm_standalone.ipynb`

- [ ] **Step 1: Add Cell 3 — fit GaussianHMM**

```python
N_STATES    = 3
N_ITER      = 200
RANDOM_SEED = 42

model = GaussianHMM(
    n_components=N_STATES,
    covariance_type="full",
    n_iter=N_ITER,
    random_state=RANDOM_SEED,
)
model.fit(returns)

print(f"Converged: {model.monitor_.converged}")
print(f"Log-likelihood: {model.score(returns):.2f}")
```

Run cell. Expected: `Converged: True`

- [ ] **Step 2: Add Cell 4 — state alignment (sort by mean return)**

States from hmmlearn are arbitrarily numbered. Reorder so state 0=bear, 1=neutral, 2=bull.

```python
# Per-state mean return
raw_means = model.means_.flatten()           # shape (N_STATES,)
order     = np.argsort(raw_means)            # ascending: lowest mean = bear
LABELS    = {order[0]: "bear", order[1]: "neutral", order[2]: "bull"}
COLORS    = {"bear": "#ef4444", "neutral": "#f59e0b", "bull": "#22c55e"}

# Viterbi decode → state sequence
hidden_states = model.predict(returns)       # shape (T,)
state_labels  = [LABELS[s] for s in hidden_states]

# Per-state annualized stats
for i, label in LABELS.items():
    seg = returns[hidden_states == i].flatten()
    print(f"State {i} ({label:7s}): μ_ann={np.mean(seg)*252:.4f}  σ_ann={np.std(seg)*np.sqrt(252):.4f}  n={len(seg)}")
```

- [ ] **Step 3: Add Cell 5 — verify transition matrix**

```python
print("Transition matrix (aligned):")
tm = model.transmat_
for i in range(N_STATES):
    row = "  ".join(f"→{LABELS[j]}:{tm[i,j]:.3f}" for j in range(N_STATES))
    print(f"  {LABELS[i]:7s}: {row}")
```

- [ ] **Step 4: Commit**

```bash
git add "hmm_standalone.ipynb"
git commit -m "feat: add HMM fitting and state alignment to hmm_standalone"
```

---

## Task 3: `hmm_standalone.ipynb` — Visualization

**Files:**
- Modify: `hmm_standalone.ipynb`

- [ ] **Step 1: Add Cell 6 — regime overlay on price chart**

```python
fig, ax = plt.subplots(figsize=(16, 4))

ax.plot(dates, close.values[1:], color="#94a3b8", linewidth=0.8, label=TICKER)

# Shade regime bands
current_state = state_labels[0]
seg_start     = dates[0]
for i in range(1, len(state_labels)):
    if state_labels[i] != current_state or i == len(state_labels) - 1:
        ax.axvspan(seg_start, dates[i], alpha=0.25, color=COLORS[current_state])
        current_state = state_labels[i]
        seg_start     = dates[i]

patches = [mpatches.Patch(color=COLORS[l], alpha=0.5, label=l.capitalize()) for l in ["bear","neutral","bull"]]
ax.legend(handles=patches + [ax.lines[0]], loc="upper left", fontsize=9)
ax.set_title(f"{TICKER} — HMM 3-State Regime (GaussianHMM)")
ax.set_ylabel("Price")
plt.tight_layout()
plt.show()
```

- [ ] **Step 2: Add Cell 7 — per-regime segment stats table**

```python
# Find changepoints: days where state changes
cp_indices = [i for i in range(1, len(hidden_states)) if hidden_states[i] != hidden_states[i-1]]
boundaries = [0] + cp_indices + [len(hidden_states)]

rows = []
for sid in range(len(boundaries) - 1):
    s, e = boundaries[sid], boundaries[sid + 1]
    state = hidden_states[s]
    label = LABELS[state]
    stats_start = s + 1 if sid > 0 else s
    seg_rets = log_returns.values[stats_start:e]
    mean_ann = float(np.mean(seg_rets)) * 252       if len(seg_rets) > 1 else 0.0
    std_ann  = float(np.std(seg_rets, ddof=1)) * np.sqrt(252) if len(seg_rets) > 1 else 0.0
    rows.append({
        "segment": sid,
        "label":   label,
        "start":   str(dates[s].date()),
        "end":     str(dates[e-1].date()),
        "n_days":  e - s,
        "μ_ann":   round(mean_ann, 4),
        "σ_ann":   round(std_ann, 4),
    })

df_segs = pd.DataFrame(rows)
print(df_segs.to_string(index=False))
```

- [ ] **Step 3: Commit**

```bash
git add "hmm_standalone.ipynb"
git commit -m "feat: add HMM regime visualization and segment stats"
```

---

## Task 4: Extract `api/bocpd.py`

**Files:**
- Create: `api/bocpd.py`
- Modify: `api/server.py`

- [ ] **Step 1: Create `api/bocpd.py` — move StudentT and run_bocpd**

```python
# api/bocpd.py
import numpy as np
import scipy.stats as ss
import yfinance as yf
from datetime import datetime


class StudentT:
    def __init__(self, alpha=1.0, beta=1e-4, kappa=1.0, mu=0.0):
        self.alpha0 = self.alpha = np.array([alpha])
        self.beta0  = self.beta  = np.array([beta])
        self.kappa0 = self.kappa = np.array([kappa])
        self.mu0    = self.mu    = np.array([mu])

    def pdf(self, data):
        return ss.t.pdf(
            x=data,
            df=2 * self.alpha,
            loc=self.mu,
            scale=np.sqrt(self.beta * (self.kappa + 1) / (self.alpha * self.kappa)),
        )

    def update_theta(self, data):
        muT    = np.concatenate((self.mu0,    (self.kappa * self.mu + data) / (self.kappa + 1)))
        kappaT = np.concatenate((self.kappa0, self.kappa + 1.0))
        alphaT = np.concatenate((self.alpha0, self.alpha + 0.5))
        betaT  = np.concatenate((self.beta0,  self.beta + (self.kappa * (data - self.mu) ** 2) / (2.0 * (self.kappa + 1.0))))
        self.mu, self.kappa, self.alpha, self.beta = muT, kappaT, alphaT, betaT


def run_bocpd(ticker: str, start: str, end: str, lambda_: int = 250, threshold: float = 0.8) -> dict:
    raw = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    if raw is None or len(raw) < 20:
        raise ValueError(f"Not enough data for {ticker} ({start} → {end})")

    close_prices = raw["Close"].squeeze().dropna()
    log_returns  = np.log(close_prices).diff().dropna()
    returns = log_returns.values.reshape(-1, 1)
    dates   = log_returns.index
    T       = len(returns)

    eps = 1e-7
    likelihood = StudentT()
    R = np.zeros((T, T))
    R[0, 0] = 1.0

    for t in range(T - 1):
        pred = likelihood.pdf(returns[t])
        H    = np.ones(t + 1) / lambda_
        R[1:t+2, t+1] = R[:t+1, t] * pred * (1 - H)
        R[0,     t+1] = np.sum(R[:t+1, t] * pred * H)
        col_sum = np.sum(R[:, t+1])
        R[:, t+1] /= (col_sum + eps)
        likelihood.update_theta(returns[t])

    short_run_prob = R[:10, :].sum(axis=0)
    map_run_length = np.argmax(R, axis=0)

    spike_mask = (short_run_prob > threshold).astype(int)
    cp_indices = np.where(np.diff(spike_mask) > 0)[0]

    regime = np.zeros(T, dtype=int)
    for i, cp in enumerate(cp_indices):
        regime[cp:] = i + 1

    boundaries = [0] + list(cp_indices) + [T]
    segments = []
    for sid in range(len(boundaries) - 1):
        s, e = boundaries[sid], boundaries[sid + 1]
        stats_start = s + 1 if sid > 0 else s
        seg_rets = log_returns.values[stats_start:e]
        n = e - s
        mean_ann = float(np.mean(seg_rets)) * 252       if len(seg_rets) > 1 else 0.0
        std_ann  = float(np.std(seg_rets, ddof=1)) * np.sqrt(252) if len(seg_rets) > 1 else 0.0
        segments.append({
            "id": sid,
            "start": str(dates[s].date()),
            "end":   str(dates[e - 1].date()),
            "n_days": n,
            "mean_return_annual": round(mean_ann, 6),
            "std_annual":         round(std_ann, 6),
        })

    last_close = float(close_prices.iloc[-1])
    prev_close = float(close_prices.iloc[-2])
    day_change = last_close - prev_close
    day_pct    = day_change / prev_close

    def to_py(obj):
        if isinstance(obj, dict):  return {k: to_py(v) for k, v in obj.items()}
        if isinstance(obj, list):  return [to_py(v) for v in obj]
        if isinstance(obj, (np.integer,)):  return int(obj)
        if isinstance(obj, (np.floating,)): return float(obj)
        return obj

    return to_py({
        "metadata": {
            "ticker":         ticker.upper(),
            "lambda":         lambda_,
            "threshold":      threshold,
            "short_window":   10,
            "n_changepoints": len(cp_indices),
            "last_updated":   str(dates[-1].date()),
            "last_close":     round(last_close, 2),
            "day_change":     round(day_change, 2),
            "day_pct":        round(day_pct, 6),
        },
        "prices": [
            {"date": str(d.date()), "close": round(float(v), 2)}
            for d, v in zip(dates, close_prices.values[1:])
        ],
        "short_run_prob": [
            {"date": str(d.date()), "prob": round(float(p), 6)}
            for d, p in zip(dates, short_run_prob)
        ],
        "changepoints": [
            {"date": str(dates[i].date()), "index": int(i)}
            for i in cp_indices
        ],
        "regime_segments": segments,
        "run_length_map": [
            {"date": str(d.date()), "run_length": int(r)}
            for d, r in zip(dates, map_run_length)
        ],
    })
```

- [ ] **Step 2: Update `api/server.py` — replace inline logic with import**

Replace the `StudentT` class definition and `run_bocpd` function in `server.py` with:

```python
from bocpd import run_bocpd
```

Remove the `import scipy.stats as ss` line (it's now only needed in `bocpd.py`). Keep all other imports and route handlers unchanged.

- [ ] **Step 3: Verify server still starts**

```bash
cd "api" && python -c "from bocpd import run_bocpd; print('bocpd import OK')"
```

Expected: `bocpd import OK`

- [ ] **Step 4: Commit**

```bash
git add api/bocpd.py api/server.py
git commit -m "refactor: extract StudentT and run_bocpd into api/bocpd.py"
```

---

## Task 5: Create `api/hmm.py`

**Files:**
- Create: `api/hmm.py`
- Modify: `api/requirements.txt`

- [ ] **Step 1: Add hmmlearn to requirements.txt**

Append to `api/requirements.txt`:
```
hmmlearn
```

Install: `pip install hmmlearn`

- [ ] **Step 2: Create `api/hmm.py`**

```python
# api/hmm.py
import numpy as np
import yfinance as yf
from hmmlearn.hmm import GaussianHMM


_N_STATES    = 3
_N_ITER      = 300
_RANDOM_SEED = 42
_VOL_WINDOW  = 21   # rolling window for realized volatility feature


def run_hmm(ticker: str, start: str, end: str, n_states: int = _N_STATES) -> dict:
    # ── Download data ──────────────────────────────────────────────────────
    raw = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    if raw is None or len(raw) < 20:
        raise ValueError(f"Not enough data for {ticker} ({start} → {end})")

    close_prices = raw["Close"].squeeze().dropna()
    log_returns  = np.log(close_prices).diff().dropna()
    dates        = log_returns.index
    T            = len(log_returns)

    # ── 2D features: [log_return, rolling_vol_21] ─────────────────────────
    roll_vol = log_returns.rolling(_VOL_WINDOW).std().bfill()
    features = np.column_stack([log_returns.values, roll_vol.values])

    # ── Fit HMM ────────────────────────────────────────────────────────────
    model = GaussianHMM(
        n_components=n_states,
        covariance_type="full",
        n_iter=_N_ITER,
        random_state=_RANDOM_SEED,
    )
    model.fit(features)

    # ── State alignment: sort by rolling_vol mean (col 1) ascending ───────
    # lowest vol = bull, highest vol = bear
    order     = np.argsort(model.means_[:, 1])
    LABEL_MAP = {int(order[0]): "bull", int(order[1]): "neutral", int(order[2]): "bear"}

    hidden_states = model.predict(features)

    # ── Changepoints: days where state changes ─────────────────────────────
    cp_indices = [i for i in range(1, T) if hidden_states[i] != hidden_states[i - 1]]
    boundaries = [0] + cp_indices + [T]

    # ── Segment stats ──────────────────────────────────────────────────────
    segments = []
    for sid in range(len(boundaries) - 1):
        s, e = boundaries[sid], boundaries[sid + 1]
        state = int(hidden_states[s])
        label = LABEL_MAP[state]
        stats_start = s + 1 if sid > 0 else s
        seg_rets = log_returns.values[stats_start:e]
        mean_ann = float(np.mean(seg_rets)) * 252       if len(seg_rets) > 1 else 0.0
        std_ann  = float(np.std(seg_rets, ddof=1)) * np.sqrt(252) if len(seg_rets) > 1 else 0.0
        segments.append({
            "id":                  sid,
            "label":               label,
            "start":               str(dates[s].date()),
            "end":                 str(dates[e - 1].date()),
            "n_days":              e - s,
            "mean_return_annual":  round(mean_ann, 6),
            "std_annual":          round(std_ann, 6),
        })

    # ── Per-state parameters ───────────────────────────────────────────────
    state_params = []
    for orig_state, label in LABEL_MAP.items():
        seg      = log_returns.values[hidden_states == orig_state]
        mean_ann = float(np.mean(seg)) * 252      if len(seg) > 1 else 0.0
        std_ann  = float(np.std(seg)) * np.sqrt(252) if len(seg) > 1 else 0.0
        vol_mean = float(model.means_[orig_state][1])   # mean of rolling_vol feature
        state_params.append({
            "state":       orig_state,
            "label":       label,
            "mean_annual": round(mean_ann, 6),
            "std_annual":  round(std_ann, 6),
            "vol_mean":    round(vol_mean, 6),
        })
    state_params.sort(key=lambda x: x["vol_mean"])

    # ── Price info ─────────────────────────────────────────────────────────
    last_close = float(close_prices.iloc[-1])
    prev_close = float(close_prices.iloc[-2])
    day_change = last_close - prev_close
    day_pct    = day_change / prev_close

    def to_py(obj):
        if isinstance(obj, dict):  return {k: to_py(v) for k, v in obj.items()}
        if isinstance(obj, list):  return [to_py(v) for v in obj]
        if isinstance(obj, (np.integer,)):  return int(obj)
        if isinstance(obj, (np.floating,)): return float(obj)
        return obj

    return to_py({
        "metadata": {
            "ticker":         ticker.upper(),
            "n_states":       n_states,
            "n_changepoints": len(cp_indices),
            "converged":      bool(model.monitor_.converged),
            "last_updated":   str(dates[-1].date()),
            "last_close":     round(last_close, 2),
            "day_change":     round(day_change, 2),
            "day_pct":        round(day_pct, 6),
        },
        "prices": [
            {"date": str(d.date()), "close": round(float(v), 2)}
            for d, v in zip(dates, close_prices.values[1:])
        ],
        "changepoints": [
            {"date": str(dates[i].date()), "index": int(i)}
            for i in cp_indices
        ],
        "regime_segments": segments,
        "state_sequence": [
            {"date": str(d.date()), "state": int(s), "label": LABEL_MAP[int(s)]}
            for d, s in zip(dates, hidden_states)
        ],
        "state_params": state_params,
        "transition_matrix": model.transmat_.tolist(),
    })
```

- [ ] **Step 3: Verify import**

```bash
cd "api" && python -c "from hmm import run_hmm; print('hmm import OK')"
```

Expected: `hmm import OK`

- [ ] **Step 4: Commit**

```bash
git add api/hmm.py api/requirements.txt
git commit -m "feat: add api/hmm.py with GaussianHMM 3-state regime detection"
```

---

## Task 6: Tests for `bocpd.py` and `hmm.py`

**Files:**
- Create: `api/tests/__init__.py`
- Create: `api/tests/test_bocpd.py`
- Create: `api/tests/test_hmm.py`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p api/tests && touch api/tests/__init__.py
```

- [ ] **Step 2: Create `api/tests/test_bocpd.py`**

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
import pytest
from bocpd import StudentT, run_bocpd


def test_student_t_pdf_positive():
    """pdf should return positive values for any scalar input."""
    st = StudentT()
    result = st.pdf(0.01)
    assert result.shape == (1,)
    assert result[0] > 0


def test_student_t_update_grows():
    """After update, parameter arrays should grow by 1."""
    st = StudentT()
    st.update_theta(0.005)
    assert len(st.mu) == 2
    assert len(st.alpha) == 2


def test_run_bocpd_returns_expected_keys():
    """run_bocpd should return a dict with all required top-level keys."""
    result = run_bocpd("SPY", "2020-01-01", "2021-01-01")
    for key in ["metadata", "prices", "short_run_prob", "changepoints",
                "regime_segments", "run_length_map"]:
        assert key in result, f"Missing key: {key}"


def test_run_bocpd_prices_length_matches_short_run_prob():
    result = run_bocpd("SPY", "2020-01-01", "2021-01-01")
    assert len(result["prices"]) == len(result["short_run_prob"])


def test_run_bocpd_regime_segments_cover_full_range():
    result = run_bocpd("SPY", "2020-01-01", "2021-01-01")
    segs = result["regime_segments"]
    assert segs[0]["start"] == result["prices"][0]["date"]
    assert segs[-1]["end"]  == result["prices"][-1]["date"]


def test_run_bocpd_raises_on_bad_ticker():
    with pytest.raises(ValueError):
        run_bocpd("XXXXXXXXXX", "2020-01-01", "2021-01-01")
```

- [ ] **Step 3: Run bocpd tests**

```bash
cd api && python -m pytest tests/test_bocpd.py -v
```

Expected: all 6 tests pass (network-dependent; requires internet access)

- [ ] **Step 4: Create `api/tests/test_hmm.py`**

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from hmm import run_hmm


def test_run_hmm_returns_expected_keys():
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    for key in ["metadata", "prices", "changepoints", "regime_segments",
                "state_sequence", "state_params", "transition_matrix"]:
        assert key in result, f"Missing key: {key}"


def test_run_hmm_state_params_labels():
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    labels = {p["label"] for p in result["state_params"]}
    assert labels == {"bear", "neutral", "bull"}


def test_run_hmm_state_params_sorted_by_mean():
    """state_params should be sorted ascending by mean_annual (bear → bull)."""
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    means = [p["mean_annual"] for p in result["state_params"]]
    assert means == sorted(means)


def test_run_hmm_state_sequence_length_matches_prices():
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    assert len(result["state_sequence"]) == len(result["prices"])


def test_run_hmm_transition_matrix_rows_sum_to_one():
    import numpy as np
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    tm = np.array(result["transition_matrix"])
    assert tm.shape == (3, 3)
    np.testing.assert_allclose(tm.sum(axis=1), np.ones(3), atol=1e-6)


def test_run_hmm_regime_segments_cover_full_range():
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    segs = result["regime_segments"]
    assert segs[0]["start"] == result["prices"][0]["date"]
    assert segs[-1]["end"]  == result["prices"][-1]["date"]


def test_run_hmm_raises_on_bad_ticker():
    with pytest.raises(ValueError):
        run_hmm("XXXXXXXXXX", "2020-01-01", "2021-01-01")
```

- [ ] **Step 5: Run HMM tests**

```bash
cd api && python -m pytest tests/test_hmm.py -v
```

Expected: all 7 tests pass

- [ ] **Step 6: Commit**

```bash
git add api/tests/
git commit -m "test: add unit tests for bocpd.py and hmm.py"
```

---

## Task 7: Add `/hmm` Endpoint to `api/server.py`

**Files:**
- Modify: `api/server.py`

- [ ] **Step 1: Add import at top of server.py**

After the existing `from bocpd import run_bocpd` line, add:

```python
from hmm import run_hmm
```

- [ ] **Step 2: Add /hmm route**

After the existing `/bocpd` route, add:

```python
@app.route("/hmm")
def hmm():
    ticker = request.args.get("ticker", "SPY").upper().strip()
    start  = request.args.get("start",  "2016-01-01")
    end    = request.args.get("end",    datetime.today().strftime("%Y-%m-%d"))

    try:
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end,   "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if start >= end:
        return jsonify({"error": "start must be before end."}), 400

    try:
        print(f"[HMM] {ticker}  {start} → {end}")
        result = run_hmm(ticker, start, end)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Server error: {e}"}), 500
```

- [ ] **Step 3: Verify endpoint manually**

```bash
cd api && python server.py &
curl "http://localhost:8765/hmm?ticker=SPY&start=2020-01-01&end=2021-01-01" | python -m json.tool | head -40
```

Expected: JSON with `metadata`, `prices`, `changepoints`, `regime_segments`, `state_sequence`, `state_params`, `transition_matrix`

Kill the server: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add api/server.py
git commit -m "feat: add /hmm endpoint to Flask API"
```

---

## Task 8: `comparison.ipynb` — Cross-Method Analysis

**Files:**
- Create: `comparison.ipynb`

- [ ] **Step 1: Create notebook, Cell 1 — imports and sys.path**

```python
import sys
sys.path.insert(0, 'api')   # allows importing bocpd.py and hmm.py

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from bocpd import run_bocpd
from hmm import run_hmm

plt.style.use('seaborn-v0_8-darkgrid')

TICKER = "SPY"
START  = "2016-01-01"
END    = "2026-04-14"
```

- [ ] **Step 2: Add Cell 2 — run both methods**

```python
print("Running BOCPD…")
bocpd_result = run_bocpd(TICKER, START, END)

print("Running HMM…")
hmm_result = run_hmm(TICKER, START, END)

print(f"BOCPD changepoints: {bocpd_result['metadata']['n_changepoints']}")
print(f"HMM   changepoints: {hmm_result['metadata']['n_changepoints']}")
```

- [ ] **Step 3: Add Cell 3 — side-by-side regime overlay**

```python
import pandas as pd

prices_df = pd.DataFrame(bocpd_result["prices"]).set_index("date")

# Map dates to HMM labels
hmm_seq   = pd.DataFrame(hmm_result["state_sequence"]).set_index("date")
HMM_COLORS = {"bear": "#ef4444", "neutral": "#f59e0b", "bull": "#22c55e"}
BOCPD_COLOR = "#3b82f6"

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(16, 7), sharex=True)

for ax, title in [(ax1, "BOCPD Regimes"), (ax2, "HMM 3-State Regimes")]:
    ax.plot(prices_df.index, prices_df["close"], color="#94a3b8", linewidth=0.7)
    ax.set_title(f"{TICKER} — {title}", fontsize=11)
    ax.set_ylabel("Price")

# Shade BOCPD changepoints as vertical lines
for cp in bocpd_result["changepoints"]:
    ax1.axvline(x=cp["date"], color=BOCPD_COLOR, alpha=0.5, linewidth=0.8)

# Shade HMM regime bands
state_labels = hmm_seq["label"].values
state_dates  = hmm_seq.index.tolist()
cur = state_labels[0]; seg_s = state_dates[0]
for i in range(1, len(state_labels)):
    if state_labels[i] != cur or i == len(state_labels) - 1:
        ax2.axvspan(seg_s, state_dates[i], alpha=0.2, color=HMM_COLORS[cur])
        cur = state_labels[i]; seg_s = state_dates[i]

patches = [mpatches.Patch(color=HMM_COLORS[l], alpha=0.5, label=l.capitalize())
           for l in ["bear", "neutral", "bull"]]
ax2.legend(handles=patches, loc="upper left", fontsize=9)

plt.tight_layout()
plt.show()
```

- [ ] **Step 4: Add Cell 4 — agreement metrics**

```python
# Align both methods on same dates
hmm_seq_aligned = hmm_seq.reindex(prices_df.index)

# BOCPD regime label: derive from regime_segments
bocpd_segs = bocpd_result["regime_segments"]
bocpd_label_map = {}
for seg in bocpd_segs:
    for d in pd.date_range(seg["start"], seg["end"], freq="B"):
        date_str = str(d.date())
        mu = seg["mean_return_annual"]
        bocpd_label_map[date_str] = "bull" if mu > 0.05 else "bear" if mu < -0.05 else "neutral"

# Align
common_dates = [d for d in prices_df.index if d in bocpd_label_map and d in hmm_seq.index]
bocpd_labels = [bocpd_label_map[d] for d in common_dates]
hmm_labels   = [hmm_seq.loc[d, "label"] for d in common_dates]

agree = sum(b == h for b, h in zip(bocpd_labels, hmm_labels))
total = len(common_dates)
print(f"Day-level agreement: {agree}/{total} = {agree/total:.1%}")

# Confusion matrix
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay
label_order = ["bear", "neutral", "bull"]
cm = confusion_matrix(bocpd_labels, hmm_labels, labels=label_order)
disp = ConfusionMatrixDisplay(cm, display_labels=label_order)
disp.plot(cmap="Blues")
plt.title("BOCPD (rows) vs HMM (cols) regime label confusion")
plt.tight_layout()
plt.show()
```

- [ ] **Step 5: Add Cell 5 — per-regime stats comparison table**

```python
print("=== BOCPD Segments ===")
bocpd_df = pd.DataFrame(bocpd_result["regime_segments"])
print(bocpd_df[["id","start","end","n_days","mean_return_annual","std_annual"]].to_string(index=False))

print("\n=== HMM Segments ===")
hmm_df = pd.DataFrame(hmm_result["regime_segments"])
print(hmm_df[["id","label","start","end","n_days","mean_return_annual","std_annual"]].to_string(index=False))

print("\n=== HMM State Parameters ===")
params_df = pd.DataFrame(hmm_result["state_params"])
print(params_df.to_string(index=False))
```

- [ ] **Step 6: Commit**

```bash
git add comparison.ipynb
git commit -m "feat: add comparison.ipynb with BOCPD vs HMM regime analysis"
```

---

## Task 9: Frontend — `types/hmm.ts`

**Files:**
- Create: `spy-bocpd-dashboard/src/types/hmm.ts`

- [ ] **Step 1: Create `src/types/hmm.ts`**

```typescript
export interface StatePoint {
  date: string
  state: number
  label: 'bear' | 'neutral' | 'bull'
}

export interface StateParam {
  state: number
  label: 'bear' | 'neutral' | 'bull'
  mean_annual: number
  std_annual: number
}

export interface HMMSegment {
  id: number
  label: 'bear' | 'neutral' | 'bull'
  start: string
  end: string
  n_days: number
  mean_return_annual: number
  std_annual: number
}

export interface HMMData {
  metadata: {
    ticker?: string
    n_states: number
    n_changepoints: number
    converged: boolean
    last_updated: string
    last_close: number
    day_change: number
    day_pct: number
  }
  prices: Array<{ date: string; close: number }>
  changepoints: Array<{ date: string; index: number }>
  regime_segments: HMMSegment[]
  state_sequence: StatePoint[]
  state_params: StateParam[]
  transition_matrix: number[][]
}
```

- [ ] **Step 2: Commit**

```bash
git add spy-bocpd-dashboard/src/types/hmm.ts
git commit -m "feat: add HMMData TypeScript types"
```

---

## Task 10: Frontend — `hooks/useHMMData.ts`

**Files:**
- Create: `spy-bocpd-dashboard/src/hooks/useHMMData.ts`

- [ ] **Step 1: Create `src/hooks/useHMMData.ts`**

```typescript
import { useState, useCallback } from 'react'
import type { HMMData } from '../types/hmm'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8765'

export interface HMMFetchParams {
  ticker: string
  start: string
  end: string
}

export interface UseHMMDataReturn {
  data: HMMData | null
  loading: boolean
  error: string | null
  fetch: (params: HMMFetchParams) => Promise<void>
}

export function useHMMData(): UseHMMDataReturn {
  const [data,    setData]    = useState<HMMData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async (params: HMMFetchParams) => {
    setLoading(true)
    setError(null)

    const url = new URL(`${API_BASE}/hmm`)
    url.searchParams.set('ticker', params.ticker)
    url.searchParams.set('start',  params.start)
    url.searchParams.set('end',    params.end)

    try {
      const res  = await fetch(url.toString())
      const json = await res.json() as HMMData & { error?: string }

      if (!res.ok || json.error) {
        setError(json.error ?? `Server error (${res.status})`)
        return
      }

      setData(json)
    } catch {
      setError('Cannot reach API server. Run: python server.py')
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetch: fetchData }
}
```

- [ ] **Step 2: Commit**

```bash
git add spy-bocpd-dashboard/src/hooks/useHMMData.ts
git commit -m "feat: add useHMMData hook"
```

---

## Task 11: Frontend — Method Selector in `ControlBar.tsx`

**Files:**
- Modify: `spy-bocpd-dashboard/src/components/ControlBar.tsx`

- [ ] **Step 1: Add `method` to `QueryParams` interface**

In `ControlBar.tsx`, update the `QueryParams` interface:

```typescript
export interface QueryParams {
  ticker: string
  start: string
  end: string
  lambda: number
  threshold: number
  method: 'bocpd' | 'hmm'
}
```

- [ ] **Step 2: Add `method` state and update `Props` defaults**

In the `Props` interface, `defaults` already includes the new field. Add state inside the component after `threshold` state:

```typescript
const [method, setMethod] = useState<'bocpd' | 'hmm'>(defaults.method ?? 'bocpd')
```

Update `handleSubmit` to include method:

```typescript
onSubmit({
  ticker:    ticker.toUpperCase().trim(),
  start,
  end,
  lambda:    lambdaNum,
  threshold: thresholdNum,
  method,
})
```

- [ ] **Step 3: Add method toggle buttons after the brand span**

After `<span className="...">BOCPD Dashboard</span>`, add:

```tsx
<div className="flex gap-0.5 bg-bg border border-border rounded p-0.5">
  {(['bocpd', 'hmm'] as const).map((m) => (
    <button
      key={m}
      type="button"
      onClick={() => setMethod(m)}
      disabled={loading}
      className={`px-2.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
        method === m
          ? 'bg-blue text-white'
          : 'text-t3 hover:text-t2'
      }`}
    >
      {m.toUpperCase()}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Hide BOCPD-only params when method is HMM**

Wrap the lambda section and threshold section with a conditional:

```tsx
{method === 'bocpd' && (
  <>
    <div className="w-px h-4 bg-border" />
    {/* Lambda — number input + quick chips */}
    {/* ... existing lambda JSX ... */}
    {/* Threshold — slider */}
    {/* ... existing threshold JSX ... */}
  </>
)}
```

- [ ] **Step 5: Update loading text in `App.tsx` to be method-aware**

In `App.tsx`, the loading overlay currently says `Running BOCPD algorithm…`. This will be updated in the next task when method state moves to App.tsx — skip this step here.

- [ ] **Step 6: Commit**

```bash
git add spy-bocpd-dashboard/src/components/ControlBar.tsx
git commit -m "feat: add BOCPD/HMM method selector to ControlBar"
```

---

## Task 12: Frontend — Wire Method Switching in `App.tsx`

**Files:**
- Modify: `spy-bocpd-dashboard/src/App.tsx`

- [ ] **Step 1: Import useHMMData and HMMData**

Add to imports at top of `App.tsx`:

```typescript
import { useHMMData } from './hooks/useHMMData'
import type { HMMData } from './types/hmm'
```

- [ ] **Step 2: Add HMM hook and method state**

Inside `App()`, after the existing `useBOCPDData` call:

```typescript
const { data: hmmData, loading: hmmLoading, error: hmmError, fetch: fetchHMM } = useHMMData()
const [method, setMethod] = useState<'bocpd' | 'hmm'>('bocpd')
```

- [ ] **Step 3: Update the onSubmit handler to route by method**

Replace:
```typescript
onSubmit={(p) => { setFocusDate(''); fetch(p) }}
```
With:
```typescript
onSubmit={(p) => {
  setFocusDate('')
  setMethod(p.method)
  if (p.method === 'hmm') {
    fetchHMM({ ticker: p.ticker, start: p.start, end: p.end })
  } else {
    fetch(p)
  }
}}
```

- [ ] **Step 4: Derive active data, loading, error**

```typescript
const activeLoading = method === 'hmm' ? hmmLoading : loading
const activeError   = method === 'hmm' ? hmmError   : error

// For components that accept BOCPDData, use bocpd data.
// HMM data shares prices/changepoints/regime_segments shape — cast where safe.
const activeData = data  // always BOCPD data for existing components
```

- [ ] **Step 5: Update loading overlay text**

Replace `Running BOCPD algorithm…` with:

```tsx
<div className="text-t2 text-sm font-mono">
  Running {method.toUpperCase()} algorithm…
</div>
```

- [ ] **Step 6: Show active method in KPIBar / sidebar**

The sidebar currently shows BOCPD data. When method is HMM and hmmData is available, pass HMM segments to `SegmentStatsPanel`. Add below activeData derivation:

```typescript
const displaySegments = method === 'hmm' && hmmData
  ? hmmData.regime_segments
  : data.regime_segments

const displayChangepoints = method === 'hmm' && hmmData
  ? hmmData.changepoints
  : data.changepoints
```

Update `SegmentStatsPanel` prop to use `displaySegments`, and `PriceChangepointTimeline` to use `displayChangepoints` if that component accepts changepoints separately. (If not, keep passing `data` for now — HMM regime overlay is a future enhancement.)

- [ ] **Step 7: Update ControlBar defaults**

```typescript
defaults={{ ticker, start: '2016-01-01', end: TODAY, lambda: data.metadata.lambda ?? 250, threshold: data.metadata.threshold ?? 0.8, method: 'bocpd' }}
```

- [ ] **Step 8: Run dev server and verify**

```bash
cd spy-bocpd-dashboard && npm run dev
```

Open `http://localhost:5173`. Toggle between BOCPD and HMM, click Apply, verify:
- BOCPD: lambda/threshold controls visible, existing chart works
- HMM: lambda/threshold controls hidden, loading overlay says "Running HMM algorithm…", segment stats panel updates with HMM data after load

- [ ] **Step 9: Commit**

```bash
git add spy-bocpd-dashboard/src/App.tsx
git commit -m "feat: wire HMM method switcher in App.tsx"
```

---

## Done

At this point:
- `hmm_standalone.ipynb` — standalone HMM experiment with visualization
- `api/bocpd.py` + `api/hmm.py` — importable modules with unit tests
- `comparison.ipynb` — BOCPD vs HMM overlay, confusion matrix, segment stats
- `api/server.py` `/hmm` endpoint — live data via API
- Dashboard — BOCPD/HMM method selector with conditional params
