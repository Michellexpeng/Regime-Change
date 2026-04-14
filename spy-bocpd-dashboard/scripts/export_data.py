"""
BOCPD Export Script
Runs the full BOCPD pipeline on SPY and exports results to JSON.

Output: ../src/data/bocpd_data.json
"""

import json
import numpy as np
import pandas as pd
import scipy.stats as ss
import yfinance as yf
from datetime import datetime
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────
TICKER     = "SPY"
START_DATE = "2016-01-01"
END_DATE   = datetime.today().strftime("%Y-%m-%d")
LAMBDA_    = 250      # hazard rate inverse: expected days between changepoints
THRESHOLD  = 0.8      # short_run_prob threshold for changepoint detection
SHORT_WINDOW = 10     # P(run_length < SHORT_WINDOW) = changepoint signal
ALPHA0, BETA0 = 1, 1e-4   # Normal-Gamma prior parameters
OUTPUT_PATH = Path(__file__).parent.parent / "src" / "data" / "bocpd_data.json"


# ── Likelihood Model ────────────────────────────────────────────────────
class StudentT:
    """Normal-Gamma conjugate prior for Student-T likelihood (Adams & MacKay 2007)."""
    def __init__(self, alpha=0.1, beta=0.1, kappa=1.0, mu=0.0):
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


# ── Data Download ───────────────────────────────────────────────────────
print(f"Downloading {TICKER} {START_DATE} → {END_DATE} …")
raw = yf.download(TICKER, start=START_DATE, end=END_DATE, progress=False)
close_prices = raw["Close"].squeeze().dropna()
log_returns  = np.log(close_prices).diff().dropna()

returns = log_returns.values.reshape(-1, 1)
dates   = log_returns.index  # T dates (second day onwards)
T       = len(returns)
print(f"  {T} trading days loaded.")


# ── BOCPD Algorithm (Adams & MacKay 2007, Algorithm 1) ─────────────────
print("Running BOCPD …")
eps = 1e-7
likelihood = StudentT(alpha=ALPHA0, beta=BETA0, kappa=1, mu=0)
R = np.zeros((T, T))   # R[r, t] = P(run_length=r at time t)
R[0, 0] = 1.0

for t in range(T - 1):
    pred_prob = likelihood.pdf(returns[t])
    H = np.ones(t + 1) / LAMBDA_
    R[1:t+2, t+1] = R[:t+1, t] * pred_prob * (1 - H)
    R[0,     t+1] = np.sum(R[:t+1, t] * pred_prob * H)
    col_sum = np.sum(R[:, t+1])
    R[:, t+1] /= (col_sum + eps)
    likelihood.update_theta(returns[t])

print("BOCPD done.")


# ── Derived Quantities ──────────────────────────────────────────────────
# Changepoint signal: P(run_length < SHORT_WINDOW)
short_run_prob = R[:SHORT_WINDOW, :].sum(axis=0)   # shape (T,)

# argmax run length at each time step
map_run_length = np.argmax(R, axis=0)              # shape (T,)

# Detected changepoint indices (first day of each spike above threshold)
spike_mask   = (short_run_prob > THRESHOLD).astype(int)
cp_indices   = np.where(np.diff(spike_mask) > 0)[0]   # rising edges

# Segment assignment
regime = np.zeros(T, dtype=int)
for i, cp in enumerate(cp_indices):
    regime[cp:] = i + 1

# Segment statistics
segment_boundaries = [0] + list(cp_indices) + [T]
segments = []
for seg_id in range(len(segment_boundaries) - 1):
    s = segment_boundaries[seg_id]
    e = segment_boundaries[seg_id + 1]  # exclusive
    seg_returns = log_returns.values[s:e]
    n_days = e - s
    mean_annual = float(np.mean(seg_returns)) * 252 if n_days > 1 else 0.0
    std_annual  = float(np.std(seg_returns, ddof=1)) * np.sqrt(252) if n_days > 1 else 0.0
    segments.append({
        "id":                seg_id,
        "start":             str(dates[s].date()),
        "end":               str(dates[e - 1].date()),
        "n_days":            n_days,
        "mean_return_annual": round(mean_annual, 6),
        "std_annual":        round(std_annual, 6),
    })

# Current SPY info
last_close  = float(close_prices.iloc[-1])
prev_close  = float(close_prices.iloc[-2])
day_change  = last_close - prev_close
day_pct     = day_change / prev_close


# ── Build JSON ──────────────────────────────────────────────────────────
payload = {
    "metadata": {
        "lambda":          LAMBDA_,
        "threshold":       THRESHOLD,
        "short_window":    SHORT_WINDOW,
        "n_changepoints":  int(len(cp_indices)),
        "last_updated":    str(dates[-1].date()),
        "last_close":      round(last_close, 2),
        "day_change":      round(day_change, 2),
        "day_pct":         round(day_pct, 6),
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
}

# Convert any remaining numpy int64/float64 scalars recursively
def to_python(obj):
    if isinstance(obj, dict):
        return {k: to_python(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_python(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    return obj

payload = to_python(payload)

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_PATH, "w") as f:
    json.dump(payload, f, separators=(",", ":"))

print(f"\nExported to {OUTPUT_PATH}")
print(f"  Prices:       {len(payload['prices'])} rows")
print(f"  Changepoints: {len(payload['changepoints'])}")
print(f"  Segments:     {len(payload['regime_segments'])}")
print(f"  Last close:   ${last_close:.2f}  ({day_pct*100:+.2f}%)")
