"""
BOCPD Dashboard API Server
Usage: python scripts/server.py

Endpoints:
  GET /bocpd?ticker=SPY&start=2016-01-01&end=2026-04-14
  GET /health
"""

import numpy as np
import scipy.stats as ss
import yfinance as yf
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# ── CORS (allow Vite dev server on 5173) ───────────────────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ── Likelihood Model ────────────────────────────────────────────────────
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
        # Compute all new values from OLD self.* before any assignment
        muT    = np.concatenate((self.mu0,    (self.kappa * self.mu + data) / (self.kappa + 1)))
        kappaT = np.concatenate((self.kappa0, self.kappa + 1.0))
        alphaT = np.concatenate((self.alpha0, self.alpha + 0.5))
        betaT  = np.concatenate((self.beta0,  self.beta + (self.kappa * (data - self.mu) ** 2) / (2.0 * (self.kappa + 1.0))))
        self.mu, self.kappa, self.alpha, self.beta = muT, kappaT, alphaT, betaT


def run_bocpd(ticker: str, start: str, end: str, lambda_: int = 250, threshold: float = 0.8):
    # ── Download data ──────────────────────────────────────────────────
    raw = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    if raw is None or len(raw) < 20:
        raise ValueError(f"Not enough data for {ticker} ({start} → {end})")

    close_prices = raw["Close"].squeeze().dropna()
    log_returns  = np.log(close_prices).diff().dropna()
    returns = log_returns.values.reshape(-1, 1)
    dates   = log_returns.index
    T       = len(returns)

    # ── BOCPD ──────────────────────────────────────────────────────────
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

    # ── Derived quantities ─────────────────────────────────────────────
    short_run_prob = R[:10, :].sum(axis=0)
    map_run_length = np.argmax(R, axis=0)

    spike_mask  = (short_run_prob > threshold).astype(int)
    cp_indices  = np.where(np.diff(spike_mask) > 0)[0]

    regime = np.zeros(T, dtype=int)
    for i, cp in enumerate(cp_indices):
        regime[cp:] = i + 1

    # Segment stats
    boundaries = [0] + list(cp_indices) + [T]
    segments = []
    for sid in range(len(boundaries) - 1):
        s, e = boundaries[sid], boundaries[sid + 1]
        # For segments after the first, skip log_returns[s]: that return is
        # log(close[s]) - log(close[s-1]), i.e. the shock that triggered the
        # changepoint.  It belongs to the transition, not the new regime's
        # internal dynamics, so including it distorts μ/σ for short segments.
        stats_start = s + 1 if sid > 0 else s
        seg_rets = log_returns.values[stats_start:e]
        n = e - s   # n_days spans the full date range of the segment
        # Annualise: ×252 for mean (linear scaling), ×√252 for std
        # (variance is additive → std scales with √time, not time)
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

    # Price info
    last_close = float(close_prices.iloc[-1])
    prev_close = float(close_prices.iloc[-2])
    day_change = last_close - prev_close
    day_pct    = day_change / prev_close

    def to_py(obj):
        if isinstance(obj, dict):  return {k: to_py(v) for k, v in obj.items()}
        if isinstance(obj, list):  return [to_py(v) for v in obj]
        if isinstance(obj, (np.integer,)): return int(obj)
        if isinstance(obj, (np.floating,)): return float(obj)
        return obj

    payload = to_py({
        "metadata": {
            "ticker":        ticker.upper(),
            "lambda":        lambda_,
            "threshold":     threshold,
            "short_window":  10,
            "n_changepoints": len(cp_indices),
            "last_updated":  str(dates[-1].date()),
            "last_close":    round(last_close, 2),
            "day_change":    round(day_change, 2),
            "day_pct":       round(day_pct, 6),
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
    return payload


# ── Routes ──────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/bocpd")
def bocpd():
    ticker    = request.args.get("ticker", "SPY").upper().strip()
    start     = request.args.get("start",  "2016-01-01")
    end       = request.args.get("end",    datetime.today().strftime("%Y-%m-%d"))
    lambda_   = int(request.args.get("lambda",    250))
    threshold = float(request.args.get("threshold", 0.8))

    # Basic validation
    try:
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end,   "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if start >= end:
        return jsonify({"error": "start must be before end."}), 400

    try:
        print(f"[BOCPD] {ticker}  {start} → {end}  λ={lambda_}  thr={threshold}")
        result = run_bocpd(ticker, start, end, lambda_=lambda_, threshold=threshold)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Server error: {e}"}), 500


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8765))
    print(f"BOCPD API server running at http://0.0.0.0:{port}")
    print("  GET /bocpd?ticker=SPY&start=2016-01-01&end=2026-04-14")
    app.run(host="0.0.0.0", port=port, debug=False)
