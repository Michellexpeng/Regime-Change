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


def test_run_hmm_state_params_sorted_by_vol():
    """state_params should be sorted ascending by vol_mean (bull → neutral → bear)."""
    result = run_hmm("SPY", "2020-01-01", "2021-01-01")
    vols = [p["vol_mean"] for p in result["state_params"]]
    assert vols == sorted(vols)


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
