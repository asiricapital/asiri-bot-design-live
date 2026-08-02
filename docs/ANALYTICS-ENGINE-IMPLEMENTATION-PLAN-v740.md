# Asiri Analytics Engine v7.4.0 — Implementation Plan

## Objective

Introduce an independent Python analytics service powered by FinanceToolkit, then expose it safely through the existing Node.js application without enabling broker execution.

## Architecture

1. **Asiri Analytics Engine** — FastAPI service that owns fundamental ratios, distress/quality models and deterministic scoring.
2. **Asiri Data Provider Layer** — provider-neutral contracts for future OpenBB-style data adapters.
3. **Portfolio Ledger** — immutable transaction and performance model inspired by wealth-management systems, implemented with Asiri-owned schemas.
4. **Decision Integration** — fundamental evidence feeds Decision Intelligence and Golden Alert as an additional gate, never as an automatic trading instruction.

## Phase 1 scope

- Standalone FastAPI service under `services/analytics`.
- FinanceToolkit 2.0.7 integration.
- Health/readiness endpoint.
- Protected fundamental-analysis endpoint.
- Normalized output for profitability, liquidity, solvency and valuation ratios.
- Altman Z-Score, Piotroski F-Score and Beneish M-Score.
- Deterministic Asiri Fundamental Score and risk flags.
- Node.js gateway routes controlled by `ASIRI_ANALYTICS_URL` and `ASIRI_ANALYTICS_TOKEN`.
- No browser access to provider credentials.
- No trading or broker write path.

## Phase 2

- Define provider contracts for quote, history, fundamentals, filings and news.
- Add provider fallback, freshness, provenance and rate-limit metadata.
- Keep Yahoo/Saxo adapters behind a common interface.

## Phase 3

- Add immutable transaction ledger and account model.
- Calculate cost basis, realized/unrealized P&L, time-weighted return, cash flows and benchmark comparisons.
- Keep existing portfolio table read-only until migration is tested.

## Phase 4

- Add `fundamentalScore`, financial-quality flags and provider provenance to Decision Intelligence snapshots.
- Golden Alert requires technical qualification, market regime, liquidity, verified catalyst, Sharia gate and fundamental-risk veto.
- Execution remains human-controlled and disabled by default.
