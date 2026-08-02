from __future__ import annotations

import hmac
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Header, HTTPException, status
from starlette.concurrency import run_in_threadpool

from .models import FundamentalRequest, FundamentalResponse
from .service import analyze_fundamentals
from .settings import settings

if settings.trading_enabled:
    raise RuntimeError("Asiri Analytics Engine cannot start with trading enabled")

app = FastAPI(
    title=settings.service_name,
    version=settings.service_version,
    docs_url="/docs" if settings.asiri_analytics_token else None,
    redoc_url=None,
)


def require_internal_token(
    x_asiri_internal_token: str = Header(default="", alias="X-Asiri-Internal-Token"),
) -> None:
    configured = settings.asiri_analytics_token
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ASIRI_ANALYTICS_TOKEN is not configured",
        )
    if not hmac.compare_digest(x_asiri_internal_token, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": settings.service_name,
        "version": settings.service_version,
        "generatedAt": datetime.now(UTC).isoformat(),
        "financeToolkitConfigured": bool(settings.financial_modeling_prep_key),
        "internalAuthConfigured": bool(settings.asiri_analytics_token),
        "ready": bool(settings.financial_modeling_prep_key and settings.asiri_analytics_token),
        "executionAllowed": False,
        "tradingEnabled": False,
    }


@app.post(
    "/v1/fundamentals",
    response_model=FundamentalResponse,
    dependencies=[Depends(require_internal_token)],
)
async def fundamentals(request: FundamentalRequest) -> FundamentalResponse:
    try:
        return await run_in_threadpool(analyze_fundamentals, request)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"FinanceToolkit analysis failed: {type(error).__name__}: {error}",
        ) from error
