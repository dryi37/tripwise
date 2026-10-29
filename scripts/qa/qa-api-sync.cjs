const fs = require('fs');
const assert = require('assert');

const client = fs.readFileSync('dist/api-client.js', 'utf8');
const runtimeConfig = fs.readFileSync('dist/runtime-config.js', 'utf8');
const sync = fs.readFileSync('dist/api-sync.js', 'utf8');
const redesign = fs.readFileSync('dist/redesign.js', 'utf8');
const html = fs.readFileSync('dist/index.html', 'utf8');

assert.match(runtimeConfig, /apiBaseUrl/);
assert.doesNotMatch(client, /localhost|127\.0\.0\.1/);
assert.match(html, /runtime-config\.js[\s\S]*api-client\.js/);
assert.match(client, /Idempotency-Key/);
assert.match(client + sync, /REVISION_CONFLICT/);
assert.match(sync, /hydrateFromServer/);
assert.match(sync, /addQuoteItemFromOffer/);
assert.match(sync, /supplierOfferId:x\.supplierOfferId/, 'Activity mapping must retain the linked internal supplier offer');
assert.match(redesign, /Giá nội bộ đã liên kết/, 'Priced activities must expose their quote link');
assert.match(sync, /addManualQuoteItem/);
assert.match(sync, /saveVersion/);
assert.match(sync, /restoreVersion/);
assert.match(sync, /api\.runAgent\(t\.id,instruction,runId,api\.agentTimeoutForDays\(t\.days\)\)/);
assert.match(sync, /AGENT_AUTOPLAN_STARTED/);
assert.match(sync, /AGENT_AUTOPLAN_COMPLETED/);
assert.match(client, /X-Client-Run-Id/);
assert.match(redesign, /data-action=\"intake-generate\"/);
assert.match(redesign, /Tạo lịch trình bằng trợ lý/);
assert.match(redesign, /Trợ lý sẽ tạo lịch trình theo yêu cầu/);
assert.doesNotMatch(redesign, /chưa kết nối AI/);
assert.match(sync, /read.only/i);
assert.match(html, /api-client\.js/);
assert.match(html, /api-sync\.js/);

console.log('qa-api-sync: 22 assertions');
