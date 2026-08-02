from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field


class ProviderMetadata(BaseModel):
    provider: str
    source_url: str | None = None
    observed_at: datetime
    source_timestamp: datetime | None = None
    is_fresh: bool
    is_delayed: bool = False
    delay_minutes: int | None = None
    warnings: list[str] = Field(default_factory=list)


class ProviderPayload(BaseModel):
    symbol: str
    data: dict[str, Any]
    metadata: ProviderMetadata


class MarketDataProvider(Protocol):
    """OpenBB-inspired contract. Implementations remain Asiri-owned adapters."""

    name: str

    async def quote(self, symbol: str) -> ProviderPayload: ...

    async def history(
        self, symbol: str, start: datetime, end: datetime | None = None, interval: str = "1d"
    ) -> ProviderPayload: ...

    async def fundamentals(self, symbol: str) -> ProviderPayload: ...

    async def filings(self, symbol: str, limit: int = 20) -> ProviderPayload: ...

    async def news(self, symbol: str, limit: int = 20) -> ProviderPayload: ...
