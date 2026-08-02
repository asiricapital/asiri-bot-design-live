from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreResult:
    score: int
    classification: str
    risk_flags: list[str]
    evidence: list[str]


def _number(metrics: dict[str, float | None], key: str) -> float | None:
    value = metrics.get(key)
    return float(value) if value is not None else None


def score_fundamentals(metrics: dict[str, float | None]) -> ScoreResult:
    """Create a transparent quality score. It is evidence, not a trade instruction."""

    score = 50
    flags: list[str] = []
    evidence: list[str] = []

    roe = _number(metrics, "return_on_equity")
    if roe is not None:
        if roe >= 0.15:
            score += 10
            evidence.append("ROE is strong")
        elif roe > 0:
            score += 5
        else:
            score -= 10
            flags.append("negative_return_on_equity")

    roa = _number(metrics, "return_on_assets")
    if roa is not None:
        if roa >= 0.08:
            score += 8
            evidence.append("ROA is strong")
        elif roa > 0:
            score += 4
        else:
            score -= 8
            flags.append("negative_return_on_assets")

    margin = _number(metrics, "net_profit_margin")
    if margin is not None:
        if margin >= 0.15:
            score += 8
            evidence.append("net margin is strong")
        elif margin > 0:
            score += 4
        else:
            score -= 8
            flags.append("negative_net_margin")

    current_ratio = _number(metrics, "current_ratio")
    if current_ratio is not None:
        if current_ratio >= 1.5:
            score += 8
            evidence.append("liquidity coverage is healthy")
        elif current_ratio >= 1:
            score += 3
        elif current_ratio < 0.75:
            score -= 8
            flags.append("weak_current_ratio")

    debt_to_equity = _number(metrics, "debt_to_equity")
    if debt_to_equity is not None:
        if 0 <= debt_to_equity <= 0.5:
            score += 8
            evidence.append("leverage is conservative")
        elif debt_to_equity <= 1.5:
            score += 3
        elif debt_to_equity > 3:
            score -= 10
            flags.append("high_debt_to_equity")

    altman = _number(metrics, "altman_z_score")
    if altman is not None:
        if altman > 2.99:
            score += 10
            evidence.append("Altman Z-Score is in the safer zone")
        elif altman < 1.81:
            score -= 15
            flags.append("altman_distress_zone")
        else:
            flags.append("altman_gray_zone")

    piotroski = _number(metrics, "piotroski_score")
    if piotroski is not None:
        if piotroski >= 7:
            score += 12
            evidence.append("Piotroski F-Score indicates strong financial quality")
        elif piotroski >= 4:
            score += 3
        else:
            score -= 10
            flags.append("weak_piotroski_score")

    beneish = _number(metrics, "beneish_m_score")
    if beneish is not None:
        if beneish <= -1.78:
            score += 4
            evidence.append("Beneish M-Score is below the manipulation warning threshold")
        else:
            score -= 12
            flags.append("beneish_manipulation_risk")

    score = max(0, min(100, round(score)))
    classification = "STRONG" if score >= 75 else "MIXED" if score >= 50 else "WEAK"
    if not evidence:
        evidence.append("insufficient positive fundamental evidence")

    return ScoreResult(score=score, classification=classification, risk_flags=flags, evidence=evidence)
