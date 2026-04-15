# api/hmm.py
import numpy as np
import yfinance as yf
from hmmlearn.hmm import GaussianHMM


_N_STATES    = 3
_N_ITER      = 200
_RANDOM_SEED = 42
_VOL_WINDOW  = 21   # rolling window for realized volatility feature
_N_RESTARTS  = 5    # reduced from 10 to limit memory on free-tier servers


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
    roll_vol     = log_returns.rolling(_VOL_WINDOW).std().bfill()
    features_raw = np.column_stack([log_returns.values, roll_vol.values])

    # Standardize features for numerical stability (prevents singular covariance)
    feat_mean = features_raw.mean(axis=0)
    feat_std  = features_raw.std(axis=0)
    feat_std[feat_std < 1e-10] = 1.0       # guard against zero/near-zero variance columns
    features  = (features_raw - feat_mean) / feat_std

    # ── Fit HMM ────────────────────────────────────────────────────────────
    # ── Fit HMM with multiple restarts, pick best-separated solution ─────
    # A single random seed can land on degenerate solutions where two states
    # have nearly identical parameters and alternate every day. Running 10
    # restarts and scoring by inter-state distance avoids this.
    best_model  = None
    best_score  = -np.inf
    for seed in range(_N_RESTARTS):
        m = GaussianHMM(
            n_components=n_states,
            covariance_type="full",
            n_iter=_N_ITER,
            random_state=seed,
        )
        m.fit(features)
        if not m.monitor_.converged:
            continue
        # Score by volatility-space separation — aligns with the labeling
        # criterion (lowest vol = bull, highest = bear). Standardised-feature
        # distance does not account for the unequal variance scaling, so the
        # best-standardised model and the best-labelled model could diverge.
        hidden_states_m = m.predict(features)
        state_vol_means_score = [
            float(np.mean(roll_vol.values[hidden_states_m == s]))
            if (hidden_states_m == s).any() else 0.0
            for s in range(n_states)
        ]
        vol_dist = sum(
            abs(state_vol_means_score[i] - state_vol_means_score[j])
            for i in range(n_states) for j in range(i + 1, n_states)
        )
        if vol_dist > best_score:
            best_score = vol_dist
            best_model = m
    if best_model is None:
        # None of the 10 restarts converged — use last model but warn
        import warnings
        warnings.warn(
            f"No HMM model converged for {ticker} ({start}–{end}). "
            "Results may be unreliable.",
            RuntimeWarning,
            stacklevel=2,
        )
        best_model = m
    model = best_model

    hidden_states = model.predict(features)

    # ── State alignment: sort by actual vol_mean ascending ───────────────
    # lowest vol = bull, highest vol = bear (matches notebook fit_hmm_2d)
    state_vol_means = [
        float(np.mean(roll_vol.values[hidden_states == s]))
        if (hidden_states == s).any() else 0.0
        for s in range(n_states)
    ]
    order     = np.argsort(state_vol_means)          # ascending: lowest vol = bull
    LABEL_MAP = {int(order[0]): "bull", int(order[1]): "neutral", int(order[2]): "bear"}

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

    # ── Per-day posterior state probabilities ─────────────────────────────
    posteriors = model.predict_proba(features)  # shape (T, n_states)
    state_probs = []
    for t in range(T):
        row: dict = {"date": str(dates[t].date())}
        for orig_state, label in LABEL_MAP.items():
            row[label] = round(float(posteriors[t][orig_state]), 6)
        state_probs.append(row)

    # ── Per-state parameters ───────────────────────────────────────────────
    state_params = []
    for orig_state, label in LABEL_MAP.items():
        seg      = log_returns.values[hidden_states == orig_state]
        mean_ann = float(np.mean(seg)) * 252      if len(seg) > 1 else 0.0
        std_ann  = float(np.std(seg)) * np.sqrt(252) if len(seg) > 1 else 0.0
        vol_mean = float(np.mean(roll_vol.values[hidden_states == orig_state])) if (hidden_states == orig_state).any() else 0.0
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
            {"date": str(d.date()), "close": round(float(close_prices.loc[d]), 2)}
            for d in dates
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
        "state_probs": state_probs,
        "state_params": state_params,
        "transition_matrix": model.transmat_.tolist(),
    })
