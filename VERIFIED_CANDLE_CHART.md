# Verified daily chart / Stock Journey

Stock Journey v3 consumes the optional `chartHistory` object from its **existing**
read-only technicals request. No added quote/history requests or dependencies.
The server provides at most 126 actual daily OHLCV bars. The client verifies
symbol, source, interval, timezone, provenance, OHLC bounds, ordered/unique session
dates and the end timestamp. Without a valid candle contract, existing closes
remain a line chart and the candle control is disabled. No OHLC is manufactured.

The chart supports one month, three months and the available record. Windows
are anchored to the record's latest New York session date, with month-end
clamping. The percentage is the first-to-last close change in the displayed
window, never a claim of daily performance or portfolio return. Volume is
displayed only when supplied. A current session bar can change and is labelled.
Saved-market-memory provenance is disclosed; response time never replaces the
original bar date. OHLC is informational and never a paper fill/entry price.

The original range input still selects an index in the canonical history.
Its min/max follow the visible window. Pointer mapping accounts for these
bounds and the current responsive SVG viewBox; keyboard arrows/Home/End work.
Changing range or type never changes order size, levels, quote, wallet or ledger.
Markers are actual local paper trades in the visible symbol/date window only.

Release paths: `manual-paper-focus-ui-v3.mjs`, `manual-paper-focus-view-v3.mjs`,
`focus-workspace-v3.mjs`, plus new chart/model/CSS modules. Older paths remain
intact for cached HTML. The pre-change frontend is main
`b04b98333a63d97590d085cb32bf0ec2d69e1a45`, deploy `dep-dbhj990473hc73a59260`.
The old pre-Focus design backup remains `backup/pre-focus-studio-20261029`.
The optional backend field is backward compatible and can roll back separately.

Validation: `npm run check` includes the pure candle/range contract tests.
Actual-module DOM tests cover real candle mode, missing-OHLC line fallback,
range-to-slider mapping, 340px layout, preserved plan fields, no wallet writes,
source text and clearing stale volume during symbol changes, alongside the
existing full synthetic BUY/SELL, duplicate and stale-price guards.
