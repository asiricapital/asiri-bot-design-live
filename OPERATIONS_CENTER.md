# Recommendations and follow-up center

The home page now starts with the real server message inbox. It reads the existing `/api/signals` history and subscribes to `/api/signals/stream`; the existing backend continues generating and sending its own messages. No trading strategy, broker settings, or Telegram delivery schedule is changed by this feature.

Each purchase suggestion retains the original text, timestamp, entry instructions, stated quantity, stop and stated targets. Missing values remain missing. The full text includes the original reasoning and risk disclosures. Only validated HTTPS links to the existing `/stock-proposals#sp-…` review page are clickable; the design page does not approve or submit orders. Messages are not evidence of a proposal's current execution status.

The inbox supports type filters, search, unread status, copy, optional session sound, and deduplication independent of database/stream IDs. It does not send test messages. Server acceptance of an outgoing Telegram request is distinguished from proof of delivery to or reading on a device. Source messages are excluded from the automatic UI translation layer.

The existing paper recommendation desk is now available in the same center. It uses its existing analysis, quote, Sharia-list, liquidity, sizing, cost, and freshness gates. Its counts and trades remain separate from the broker proposal inbox.

Following a message stores its levels locally, without treating it as a filled position. While the page is visible it records fresh observed stop/target events once per message and level. Old, delayed, closed-session, failed, local-snapshot, or pre-follow quotes do not create events. Tracking ends 24 hours after the message or when manually closed. There is no reconstruction of events while the page was closed, no automatic exit, and no P&L claim. Read state, follow state and history belong to this browser and origin; unavailable/corrupted storage is preserved and blocks new tracking writes.

The inbox pauses its stream while hidden and uses bounded periodic reads after a stream failure. Data is read from the server's existing in-memory feed; no new Supabase tables, queries, paid services, jobs, or schema changes are introduced.

Backend prerequisite: `signal-feed-cors.mjs`, installed before signal-feed routes, permits only the exact design origin and GET/OPTIONS for the existing list, stream and channel-status routes. It grants no credential, broker, write, or test-message capability.

Validation: `node check-operations-center.mjs`, `node check-paper-recommendations.mjs`, `node check-home-radar.mjs`, `node check-arabic-ui-polish.mjs`, `node check-manual-paper.mjs`, and `node check-trade-decision-studio.mjs`. Browser QA covers actual source text, filters, follow/close, local history, and narrow mobile layout; no real trade or test Telegram message is needed.
