# Asiri Analytics Engine

Independent FastAPI service for fundamental analysis in Asiri Capital.

## Responsibilities

- Run FinanceToolkit calculations outside the Node.js web process.
- Keep Financial Modeling Prep credentials server-side.
- Normalize ratios and financial-health models into a stable Asiri API.
- Return evidence and risk flags, never broker orders.

## Endpoints

- `GET /health` — public readiness metadata; never returns secrets.
- `POST /v1/fundamentals` — protected by `X-Asiri-Internal-Token`.

Example request:

```json
{
  "symbols": ["PLUG", "ADMA"],
  "quarterly": true,
  "start_date": "2022-01-01",
  "include_raw": false
}
```

The response includes normalized metrics, Altman Z-Score, Piotroski F-Score, Beneish M-Score, an Asiri Fundamental Score, evidence and risk flags. `execution_allowed` and `trading_enabled` are always false.

## Required environment variables

```text
ASIRI_ANALYTICS_TOKEN=<strong random shared secret>
FINANCIAL_MODELING_PREP_KEY=<provider API key>
```

Optional:

```text
CACHE_TTL_SECONDS=900
REQUEST_TIMEOUT_SECONDS=45
TRADING_ENABLED=false
```

The service refuses to start if `TRADING_ENABLED=true`.

## Local run

```bash
cd services/analytics
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
ASIRI_ANALYTICS_TOKEN=local-only-token \
FINANCIAL_MODELING_PREP_KEY=your-key \
uvicorn app.main:app --reload
```

## Container

```bash
docker build -t asiri-analytics .
docker run --rm -p 8000:8000 \
  -e ASIRI_ANALYTICS_TOKEN=change-me \
  -e FINANCIAL_MODELING_PREP_KEY=change-me \
  asiri-analytics
```

## Integration contract

The existing Node.js service calls this service through `ASIRI_ANALYTICS_URL` and `ASIRI_ANALYTICS_TOKEN`. The browser never calls FinanceToolkit or Financial Modeling Prep directly.
