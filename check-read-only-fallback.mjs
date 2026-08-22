import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./live-server.js', import.meta.url), 'utf8');

assert.match(source, /providerState = 'polling_fallback'/, 'WebSocket failure must enter explicit fallback state');
assert.match(source, /dataMode: websocketLive \? 'live' : .*'fallback_polling'/s, 'Status must distinguish live from fallback polling');
assert.match(source, /const websocketLive = providerState === 'authenticated' \|\| providerState === 'subscribed'/, 'REST polling must stop only for authenticated live WebSocket state');
assert.match(source, /readOnly: true/, 'Read-only mode must remain enabled');
assert.match(source, /executionAllowed: false/, 'Execution must remain disabled');
assert.match(source, /automaticTrading: false/, 'Automatic trading must remain disabled');
assert.match(source, /version: '8\.0\.1-read-only-websocket-fallback'/, 'Health contract version must be updated');

console.log('read-only fallback contract: OK');
