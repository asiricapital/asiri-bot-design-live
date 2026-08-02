from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class FundamentalRequest(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=10)
    quarterly: bool = True
    start_date: str | None = None
    include_raw: bool = False

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, symbols: list[str]) -> list[str]:
        normalized: list[str] = []
        for symbol in symbols:
            value = "".join(ch for ch in str(symbol).upper().strip() if ch.isalnum() or ch in ".-")[:12]
            if value and value not in normalized:
                normalized.append(value)
        if not normalized:
            raise ValueError("At least one valid symbol is required")
        return normalized


class MetricValue(BaseModel):
    value: float | None = None
    period: str | None = None


class FundamentalResult(BaseModel):
    symbol: str
    score: int = Field(ge=0, le=100)
    classification: str
    fundamental_gate: str
    metrics: dict[str, MetricValue]
    risk_flags: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    raw: dict[str, Any] | None = None
    sharia_verified: bool = False
    execution_allowed: bool = False
    trading_enabled: bool = False


class FundamentalResponse(BaseModel):
    generated_at: datetime
    provider: str
    toolkit_version: str
    results: list[FundamentalResult]
    warnings: list[str] = Field(default_factory=list)
    execution_allowed: bool = False
    trading_enabled: bool = False
