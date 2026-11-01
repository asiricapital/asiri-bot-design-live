# Paper plan on the chart and decision review

The detailed daily chart can display the current paper BUY entry estimate,
planned stop/target and shaded price intervals. A separate card labels these as
a **current draft over historical data**, with quantities, estimated net risk,
reward and remaining cash from the same visual ticket calculation. Quote guards
still control preview/confirmation. Closed/stale readings are clearly reference
drafts. Invalid levels and SELL orders show no BUY overlay. Users can hide the
overlay without editing their order. View/type/layout controls never execute it.

## Confirmation record

`manual-paper-core-v4.mjs` preserves the previous engine calculations/guards and
ledger key/schema. A new trade gets `decisionSnapshot` only inside the existing
version-checked confirmation, before the single atomic localStorage write.
The snapshot is reconstructed from the revalidated execution estimate, rather
than accepting one attached to a preview. It contains original quote times,
price/source/currency, acknowledged USD model, reason, levels, size, costs,
cash before/after and up to 32 actual daily closes available at confirmation.
History is omitted if unavailable or from a different symbol; no replacement
chart is invented. Recommendation provenance remains on the parent trade.

Snapshots are locally stored data, not tamper-proof records or raster images.
They do not refresh with market data. Existing records are never backfilled.
The ledger and snapshots share the browser's storage limit. A quota failure
aborts the entire save and leaves the wallet unchanged; no success is reported.
These records do not sync across devices or platforms.

## Reviewing the result

The journal offers the last 100 saved snapshots alongside the existing trades.
The review shows the original plan and historical close context. Its result is
computed only from actual recorded paper sales, using net proceeds and purchase
cost including fees. Multiple buys receive sales pro rata, consistently with
the ledger's average-cost basis. Partial sales and remaining attributed shares
are labelled; they can be fractional because this is analytical attribution.
No unsold position is reported as realized profit. Missing legacy fields yield
an unavailable result. Stops/targets remain non-executing planned levels.

## Release and tests

New UI/view/core/chart filenames avoid prior cached-asset conflicts. The
previous files remain intact. Old clients can read the unchanged wallet schema;
they simply ignore optional snapshot fields. No backend/broker change.

Pre-release main: `efe91576c61347a934c000986c3c23ba21c82f9f`.
Pre-release Render deploy: `dep-dbhrdbmtlv9c73cfqksg`.
The earlier `backup/pre-focus-studio-20261029` design backup remains available.

Validation includes exact old/new preview parity, quote and recommendation
expiry, immutable captured data across later buys/sells, forged snapshot
replacement, missing/mismatched history, average-cost partial/full sale
reconciliation, duplicate confirmation and legacy-record behavior. DOM tests
exercise the actual v4 modules: overlay lines/bands/toggle, field preservation,
saved-chart review, source dates, and the complete synthetic BUY/SELL lifecycle.
Successful confirmation tests use fixtures; live closed-market quotes are not
altered or bypassed for verification.
