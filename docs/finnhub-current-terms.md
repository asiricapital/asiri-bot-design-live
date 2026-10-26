# Finnhub current plan notes

Checked 2026-10-26/27 against official sources:

- Pricing: https://finnhub.io/pricing
  - Free plan shown at $0/month.
  - Advertised limit: 60 API calls/minute.
  - US market data coverage is listed; international coverage has different availability/delay terms.
  - Terms include personal-use language.
- Quote API: https://finnhub.io/docs/api/quote
  - GET quote endpoint returns c, d, dp, h, l, o, pc, t.
  - Documentation says real-time stock prices are for US stocks and constant polling is not recommended.
- Rate limits: https://finnhub.io/docs/api/rate-limit
  - Exceeding limits returns HTTP 429.
  - There is also a 30 requests/second ceiling across plans.

ASIRI implementation decision: keep the quote server-side, expose source and observed timestamp, use a conservative local budget below the advertised free limit, and retain paper-only/execution-disabled metadata.
