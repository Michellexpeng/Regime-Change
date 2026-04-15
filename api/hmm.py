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
