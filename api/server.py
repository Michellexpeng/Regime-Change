"""
BOCPD Dashboard API Server
Usage: python scripts/server.py

Endpoints:
  GET /bocpd?ticker=SPY&start=2016-01-01&end=2026-04-14
  GET /hmm?ticker=SPY&start=2016-01-01&end=2026-04-14
  GET /health
"""

import re
from datetime import datetime
from flask import Flask, request, jsonify
from bocpd import run_bocpd
from hmm import run_hmm

app = Flask(__name__)

# ── CORS (allow Vite dev server on 5173) ───────────────────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ── Routes ──────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/bocpd")
def bocpd():
    ticker = request.args.get("ticker", "SPY").upper().strip()
    if not re.match(r'^[A-Z0-9.\-]{1,10}$', ticker):
        return jsonify({"error": "Invalid ticker: must be 1–10 alphanumeric characters"}), 400

    start = request.args.get("start", "2016-01-01")
    end   = request.args.get("end",   datetime.today().strftime("%Y-%m-%d"))

    try:
        lambda_ = int(request.args.get("lambda", 250))
        if lambda_ <= 0:
            return jsonify({"error": "lambda must be a positive integer"}), 400
        threshold = float(request.args.get("threshold", 0.8))
        if not (0.0 <= threshold <= 1.0):
            return jsonify({"error": "threshold must be between 0 and 1"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid parameter type for lambda or threshold"}), 400

    # Date validation
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


@app.route("/hmm")
def hmm():
    ticker = request.args.get("ticker", "SPY").upper().strip()
    if not re.match(r'^[A-Z0-9.\-]{1,10}$', ticker):
        return jsonify({"error": "Invalid ticker: must be 1–10 alphanumeric characters"}), 400

    start = request.args.get("start", "2016-01-01")
    end   = request.args.get("end",   datetime.today().strftime("%Y-%m-%d"))

    # Date validation
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


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8765))
    print(f"BOCPD API server running at http://0.0.0.0:{port}")
    print("  GET /bocpd?ticker=SPY&start=2016-01-01&end=2026-04-14")
    print("  GET /hmm?ticker=SPY&start=2016-01-01&end=2026-04-14")
    app.run(host="0.0.0.0", port=port, debug=False)
