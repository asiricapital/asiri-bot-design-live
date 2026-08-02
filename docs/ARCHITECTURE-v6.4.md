# Asiri Capital v6.4 — Architecture

## Runtime

`package.json` starts `bootstrap-v64.js` directly.

The bootstrap:

1. Reads the maintained source files.
2. Adds only versioned modules and routes required by the deployed UI.
3. Scopes browser database operations to the authenticated Supabase user.
4. Registers the read-only Saxo gateway.
5. Registers the Investment Committee endpoint.
6. Writes ephemeral runtime files ignored by Git.
7. Starts the generated server.

The older `bootstrap-v62.js` and `start.js` remain temporarily for rollback reference but are not part of the v6.4 production path. They should be removed after the new path has completed a stable production cycle.

## Safety invariants

- No startup code may insert, update, or delete portfolio positions.
- Broker integration permits `GET /port/*` only.
- `SAXO_ALLOW_TRADING=true` prevents server startup.
- Broker tokens are server-side and encrypted with AES-256-GCM when persistent storage is configured.
- Shadow Mode never writes to the portfolio table.
- Investment Committee output always returns `tradingEnabled=false`, `writeEnabled=false`, and `executionAllowed=false`.
- Sharia verification in Awaed is a blocking gate.
- Reports use `ASIRI_PRIMARY_USER_ID` when more than one user exists; they do not infer ownership from stock symbols.

## Investment Committee Phase 1

### Technical Analyst

Uses the existing candidate score, trend, momentum, RSI, breakout confirmation, and relative volume.

### Risk Officer

Evaluates ATR percentage, risk/reward, liquidity, market regime, stop-loss availability, and extreme daily movement. It can issue a binding veto.

### Portfolio Manager

Combines technical, risk, and market votes. It returns one of:

- `CONDITIONAL_ENTRY`
- `WATCH`
- `WAIT`
- `AVOID`

The result is explanatory and review-only.

## Planned Phase 2 modules

- News and catalyst analyst.
- Fundamental analyst.
- Strategy backtesting lab.
- Portfolio concentration and correlation risk.
- Broker snapshot persistence recovery after service restart.
- Dedicated MCP/ChatGPT read-only adapter.
