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
