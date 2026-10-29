# Manual paper workspace

This design-origin workspace uses the same `PAPER_RULES`, `halfSpreadBps`, and opening cash from the existing backend `paper-lab-engine.mjs`. `paper-lab-shared-engine.mjs` is an exact vendored snapshot of that pure module from backend main ab80fe1908b4d630ef5352fcb79d0e5c2020225c. Update that snapshot deliberately alongside parity review when the shared rules change.

The automatic `/api/paper-lab` experiment has no manual buy/sell endpoint. Manual entries therefore use an isolated local ledger (`asiri.design.manual-paper.v1`) and never mutate the automatic experiment or a broker account. There is no cloud durability. The explicit USD acknowledgment is a simulation assumption when the display quote omits currency, not verification of currency entitlement.

Manual fills use last price plus adverse slippage and half-spread (actual when available, otherwise disclosed estimate), with fee per side. They are not executable quotes. Long-only whole shares; manual stops and targets are recorded plans and never automatic orders. Position cost <= 10% of opening cash, cash reserve >=30% of opening cash, planned entry risk <=1% of opening cash. These fixed opening-cash limits are disclosed and not a live risk engine.

Preview expiry: 60 seconds. Market timestamp and observation must both be within 120 seconds. On confirm the source, price, timestamp, wallet version and all constraints are revalidated under a Web Lock. Wallet/trades are stored in one localStorage replacement; failure never reports a committed fill. Web Locks absence blocks confirmation. Duplicate request IDs are idempotent; data corruption is surfaced, never reset. The display shows the latest 100 entries without truncating persisted entries; 2000 entries block further writes for review.

Tests: `node check-manual-paper.mjs` (included in `npm run check`). Fixtures are synthetic and never published as market data. Tests cover buy, partial/full sell, net cash/P&L, immutable input, duplicate ID, price changes, expiry, version conflicts, old quotes, no shorting and allocation limits.

## Automatic draft from selected stock

Selecting a stock or side fills an editable planning draft; it never checks the currency acknowledgment, confirms an order, mutates cash or sends a broker request. BUY uses the existing read-only technical endpoint (same response as the chart), a positive ATR and matching symbol/history within 96 hours. Stop is 20-day support minus 0.25 ATR when support is below price; otherwise price minus 1.5 ATR. Nonpositive stops, missing history or excessively wide spreads yield no suggested quantity.

Whole-share quantity is the minimum allowed by free cash above the initial 30% reserve, remaining initial 10% position cost capacity, and a risk budget of 1% of the smaller of current cash and initial cash. Cost model matches the ledger; sizing also includes estimated adverse exit spread/slippage and fees. Target solves a net 2:1 reward/risk estimate under that model. Resistance before target is disclosed, not silently ignored or treated as a trade signal. No macro/news assessment is claimed.

Closed-market/latest-close prices up to 96 hours old can produce a clearly labeled REFERENCE draft. The existing live-session/original-timestamp/observation guards still block preview and commit; no reference data is promoted to live. SELL fills only owned whole shares, removes/disables buy stop/target fields, and makes no claim about exit timing. Manual edits survive quote events and in-flight technical responses. Stock/side changes explicitly replace the draft; a refresh button recalculates against the latest quote and saved wallet. Quote changes invalidate automatic-draft preview until regeneration.
