# Manual paper workspace

This design-origin workspace uses the same `PAPER_RULES`, `halfSpreadBps`, and opening cash from the existing backend `paper-lab-engine.mjs`. `paper-lab-shared-engine.mjs` is an exact vendored snapshot of that pure module from backend main ab80fe1908b4d630ef5352fcb79d0e5c2020225c. Update that snapshot deliberately alongside parity review when the shared rules change.

The automatic `/api/paper-lab` experiment has no manual buy/sell endpoint. Manual entries therefore use an isolated local ledger (`asiri.design.manual-paper.v1`) and never mutate the automatic experiment or a broker account. There is no cloud durability. The explicit USD acknowledgment is a simulation assumption when the display quote omits currency, not verification of currency entitlement.

Manual fills use last price plus adverse slippage and half-spread (actual when available, otherwise disclosed estimate), with fee per side. They are not executable quotes. Long-only whole shares; manual stops and targets are recorded plans and never automatic orders. Position cost <= 10% of opening cash, cash reserve >=30% of opening cash, planned entry risk <=1% of opening cash. These fixed opening-cash limits are disclosed and not a live risk engine.

Preview expiry: 60 seconds. Market timestamp and observation must both be within 120 seconds. On confirm the source, price, timestamp, wallet version and all constraints are revalidated under a Web Lock. Wallet/trades are stored in one localStorage replacement; failure never reports a committed fill. Web Locks absence blocks confirmation. Duplicate request IDs are idempotent; data corruption is surfaced, never reset. The display shows the latest 100 entries without truncating persisted entries; 2000 entries block further writes for review.

Tests: `node check-manual-paper.mjs` (included in `npm run check`). Fixtures are synthetic and never published as market data. Tests cover buy, partial/full sell, net cash/P&L, immutable input, duplicate ID, price changes, expiry, version conflicts, old quotes, no shorting and allocation limits.
