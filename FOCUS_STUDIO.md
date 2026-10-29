# Stock Journey / Focus Studio

Focus is the default Stock Journey view for a new visitor. Existing overview,
chart, plan and journal tabs remain available. Choosing a classic tab remembers
classic mode for future stock opens; choosing Focus remembers Focus.

## One source, one form

The focus view mounts the **original DOM nodes** for the existing daily chart,
paper ticket, risk map, calculation evidence, allocation and journal. Leaving
Focus restores each node to its original parent. There is one set of inputs,
one paper ledger, and the existing preview/confirmation handlers. Quotes and
technicals still come from the same market bridge and read-only endpoint.
No additional quote source, generated prices, broker endpoint or execution
permission is introduced. The chart remains daily closes, not OHLC candles.

Use the chart's pointer/touch inspection or its original keyboard-accessible
range input to inspect an actual close. This does not change the quote used
for the paper preview. The existing engine still rejects unusable quotes.

## Local preferences

`asiri.design.focus-layout.v1` holds only panel order, hidden panels, wide-chart
layout and mode. The chart cannot be hidden. Saved values are normalized;
unknown/duplicate panels are discarded and missing panels restored. Storage
failure leaves changes working for the visit and reports that saving failed.
Reset restores layout only, never the wallet or form values. Panel arrows work
with touch and keyboard, without drag-only controls. Small screens stack panels.
The financial ledger key `asiri.design.manual-paper.v1` is unchanged.

## Delivery and rollback

The new UI, view, stylesheet and layout module use distinct release filenames
to avoid the previously observed cached asset mismatch. Old assets stay intact.
The prior main commit is `33549742ae6152e57b56fa60521ca9efbdceb5d3`, retained on
`backup/pre-focus-studio-20261029`. Its verified Render deploy is
`dep-dbhg490473hc739tcmb0`. To restore the complete former design, revert this
release and redeploy the design service. No wallet schema migration is involved.
Render artifact rollback is another option while that build is retained.

## Verification

`npm run check` includes preference sanitation, unique control IDs and release
module syntax. DOM integration exercises the actual new modules alongside the
existing paper engine: default Focus, show/hide, reordering, wide mode, reset,
chart point inspection, original-node restoration, no wallet writes from layout,
stock navigation, automatic planning, preserved edits during quote/history
updates, BUY/SELL lifecycle, duplicate confirmation and stale-quote rejection.
Successful execution cases use synthetic fixtures; no live trade is executed.

The design borrows broad ideas from the researched interfaces, with original
ASIRI HTML/CSS. No third-party repository code, branding or mock data is copied.
