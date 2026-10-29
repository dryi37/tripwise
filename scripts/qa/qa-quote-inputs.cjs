const fs = require('fs');
const assert = require('assert');

const redesign = fs.readFileSync('dist/redesign.js', 'utf8');
const app = fs.readFileSync('dist/app.js', 'utf8');
const css = fs.readFileSync('dist/redesign.css', 'utf8');
const sync = fs.readFileSync('dist/api-sync.js', 'utf8');

assert.match(redesign, /inputmode="numeric"[^>]+class="price-input"[^>]+placeholder="–"[^>]+value="'\+\(r\.price==null\?'':vndInput\(r\.price\)\)\+'/,
  'Unit prices should render as localized numeric text');
assert.match(redesign, /function vndInput\(value\).*toLocaleString\('vi-VN'\)/,
  'VND input formatter should use Vietnamese grouping');
assert.ok(app.includes("replace(/\\D/g,'')"),
  'Quote changes should parse localized currency values safely');
assert.match(redesign, /if\(e\.target\.classList\.contains\('price-input'\)\)[^}]+replace\(\/\\D\/g,''\)[^}]+toLocaleString\('vi-VN'\)/,
  'Unit prices should add Vietnamese thousand separators while the user types');
assert.match(css, /\.unified-quote-table td:nth-child\(3\),\.unified-quote-table td:nth-child\(4\)\{[^}]*padding-left:/,
  'Quantity and unit-price cells should have visible separation after removing supplier column');
assert.match(css, /\.unified-quote-table input\{[^}]*max-width:100%[^}]*box-sizing:border-box/,
  'Quote inputs should stay inside their own cells');
assert.ok(redesign.includes('<th>THÀNH TIỀN</th>'),
  'The final quote column should be labelled Thành tiền');
const selectedQuote = redesign.slice(redesign.indexOf('function unifiedQuoteContent(t){'), redesign.indexOf('function serviceCard(s,t){'));
assert.ok(!selectedQuote.includes('<th>NHÀ CUNG CẤP</th>'),
  'The quote should focus on service and price, not repeat supplier details');
assert.ok(!redesign.includes('THÀNH TIỀN / THAO TÁC'),
  'The quote header should not mix amount and action labels');
assert.match(redesign, /money\(r\.qty\*r\.price\)/,
  'Each selected line total should be calculated from quantity and unit price');
assert.match(redesign, /r\.price==null\?'–':money\(r\.qty\*r\.price\)/,
  'Unknown prices should display a dash instead of a zero amount');
assert.match(app, /function total\(t=trip\(\)\)\{return t\.quote\.reduce\(\(s,r\)=>s\+r\.qty\*r\.price,0\)\}/,
  'The quote grand total should be calculated from all line totals');
assert.ok(!app.includes("q.id==='r1'"),
  'Development mode must not mutate a hard-coded demo quote during startup');
assert.ok(!app.includes('localStorage'),
  'Development quote values must come from the backend, not browser storage');
assert.match(sync, /unitPriceMinor[^\n]+Number\(raw\.replace\(\/\\D\/g,''\)\)/,
  'API synchronization should parse localized VND input before saving');
assert.ok(redesign.includes('Cần kiểm tra giá'), 'Unpriced activity rows must be marked for price review');

console.log('Quote input QA passed.');
