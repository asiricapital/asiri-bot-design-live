from __future__ import annotations

import importlib.metadata
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

import pandas as pd
from financetoolkit import Toolkit

from .models import FundamentalRequest, FundamentalResponse, FundamentalResult, MetricValue
from .scoring import score_fundamentals
from .settings import settings


@dataclass(frozen=True)
class MetricSpec:
    key: str
    candidates: tuple[str, ...]
    source: str


METRICS = (
    MetricSpec("return_on_equity", ("Return on Equity",), "profitability"),
    MetricSpec("return_on_assets", ("Return on Assets",), "profitability"),
    MetricSpec("net_profit_margin", ("Net Profit Margin", "Net Margin"), "profitability"),
    MetricSpec("operating_profit_margin", ("Operating Profit Margin",), "profitability"),
    MetricSpec("current_ratio", ("Current Ratio",), "liquidity"),
    MetricSpec("debt_to_equity", ("Debt to Equity Ratio", "Debt-to-Equity Ratio"), "solvency"),
    MetricSpec("price_earnings", ("Price Earnings Ratio", "Price-to-Earnings Ratio"), "valuation"),
    MetricSpec("price_to_book", ("Price to Book Ratio", "Price-to-Book Ratio"), "valuation"),
    MetricSpec("altman_z_score", ("Altman Z-Score",), "altman"),
    MetricSpec("piotroski_score", ("Piotroski Score",), "piotroski"),
    MetricSpec("beneish_m_score", ("Beneish M-Score",), "beneish"),
)

_CACHE: dict[str, tuple[float, FundamentalResponse]] = {}


def _normalized(value: Any) -> str:
    return "".join(character.lower() for character in str(value) if character.isalnum())


def _select_ticker(frame: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return pd.DataFrame()
    if isinstance(frame.index, pd.MultiIndex):
        for level in range(frame.index.nlevels):
            values = {str(value).upper() for value in frame.index.get_level_values(level)}
            if ticker.upper() in values:
                try:
                    return frame.xs(ticker, level=level, drop_level=True)
                except KeyError:
                    continue
    return frame


def _latest_metric(frame: pd.DataFrame, ticker: str, candidates: tuple[str, ...]) -> MetricValue:
    subset = _select_ticker(frame, ticker)
    if subset.empty:
        return MetricValue()

    normalized_candidates = tuple(_normalized(candidate) for candidate in candidates)
    selected_index: Any | None = None
    for index in subset.index:
        normalized_index = _normalized(index)
        if any(
            normalized_index == candidate
            or normalized_index.endswith(candidate)
            or candidate.endswith(normalized_index)
            for candidate in normalized_candidates
        ):
            selected_index = index
            break

    if selected_index is None:
        return MetricValue()

    row = subset.loc[selected_index]
    if isinstance(row, pd.DataFrame):
        row = row.iloc[-1]
    if not isinstance(row, pd.Series):
        try:
            numeric = float(row)
        except (TypeError, ValueError):
            return MetricValue()
        return MetricValue(value=numeric)

    numeric_row = pd.to_numeric(row, errors="coerce").dropna()
    if numeric_row.empty:
        return MetricValue()

    value = float(numeric_row.iloc[-1])
    period = str(numeric_row.index[-1])
    return MetricValue(value=value, period=period)


def _safe_collect(name: str, collector: Callable[[], pd.DataFrame], warnings: list[str]) -> pd.DataFrame:
    try:
        frame = collector()
        if not isinstance(frame, pd.DataFrame):
            warnings.append(f"{name}: unexpected response type")
            return pd.DataFrame()
        return frame
    except Exception as error:  # Finance providers can fail independently.
        warnings.append(f"{name}: {type(error).__name__}: {error}")
        return pd.DataFrame()


def _cache_key(request: FundamentalRequest) -> str:
    return "|".join(
        [
            ",".join(request.symbols),
            "quarterly" if request.quarterly else "annual",
            request.start_date or "default",
            "raw" if request.include_raw else "normalized",
        ]
    )


def _raw_snapshot(frames: dict[str, pd.DataFrame], ticker: str) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for name, frame in frames.items():
        subset = _select_ticker(frame, ticker)
        if subset.empty:
            continue
        limited = subset.iloc[:, -3:].copy() if subset.shape[1] > 3 else subset.copy()
        limited = limited.where(pd.notna(limited), None)
        snapshot[name] = {
            "index": [str(value) for value in limited.index[:80]],
            "columns": [str(value) for value in limited.columns],
            "data": limited.head(80).values.tolist(),
        }
    return snapshot


def _gate_for(score: int, risk_flags: list[str]) -> str:
    severe = {"altman_distress_zone", "beneish_manipulation_risk", "high_debt_to_equity"}
    flags = set(risk_flags)
    if flags.intersection(severe):
        return "VETO"
    if score < 50 or "insufficient_fundamental_coverage" in flags:
        return "REVIEW"
    return "PASS"


def analyze_fundamentals(request: FundamentalRequest) -> FundamentalResponse:
    cache_key = _cache_key(request)
    cached = _CACHE.get(cache_key)
    if cached and time.time() - cached[0] <= settings.cache_ttl_seconds:
        return cached[1]

    if not settings.financial_modeling_prep_key:
        raise RuntimeError("FINANCIAL_MODELING_PREP_KEY is not configured")

    warnings: list[str] = []
    toolkit = Toolkit(
        tickers=request.symbols,
        api_key=settings.financial_modeling_prep_key,
        quarterly=request.quarterly,
        start_date=request.start_date,
    )

    frames = {
        "profitability": _safe_collect(
            "profitability", toolkit.ratios.collect_profitability_ratios, warnings
        ),
        "liquidity": _safe_collect("liquidity", toolkit.ratios.collect_liquidity_ratios, warnings),
        "solvency": _safe_collect("solvency", toolkit.ratios.collect_solvency_ratios, warnings),
        "valuation": _safe_collect("valuation", toolkit.ratios.collect_valuation_ratios, warnings),
        "altman": _safe_collect("altman", toolkit.models.get_altman_z_score, warnings),
        "piotroski": _safe_collect("piotroski", toolkit.models.get_piotroski_score, warnings),
        "beneish": _safe_collect("beneish", toolkit.models.get_beneish_m_score, warnings),
    }

    results: list[FundamentalResult] = []
    for symbol in request.symbols:
        metric_values: dict[str, MetricValue] = {}
        scoring_values: dict[str, float | None] = {}
        for specification in METRICS:
            metric = _latest_metric(
                frames[specification.source], symbol, specification.candidates
            )
            metric_values[specification.key] = metric
            scoring_values[specification.key] = metric.value

        score = score_fundamentals(scoring_values)
        missing = sum(value.value is None for value in metric_values.values())
        risk_flags = list(score.risk_flags)
        if missing >= len(metric_values) // 2:
            risk_flags.append("insufficient_fundamental_coverage")
        risk_flags = sorted(set(risk_flags))

        results.append(
            FundamentalResult(
                symbol=symbol,
                score=score.score,
                classification=score.classification,
                fundamental_gate=_gate_for(score.score, risk_flags),
                metrics=metric_values,
                risk_flags=risk_flags,
                evidence=score.evidence,
                raw=_raw_snapshot(frames, symbol) if request.include_raw else None,
            )
        )

    response = FundamentalResponse(
        generated_at=datetime.now(UTC),
        provider="Financial Modeling Prep via FinanceToolkit",
        toolkit_version=importlib.metadata.version("financetoolkit"),
        results=results,
        warnings=warnings,
    )
    _CACHE[cache_key] = (time.time(), response)
    return response
