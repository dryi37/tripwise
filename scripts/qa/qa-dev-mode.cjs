const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('frontend/app.js', 'utf8');
const sync = fs.readFileSync('frontend/api-sync.js', 'utf8');
const redesign = fs.readFileSync('frontend/redesign.js', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');

assert.ok(/function fresh\(\)\{return \{[\s\S]*?trips:\[\]/.test(app), 'A fresh development session must not contain seeded browser trips');
assert.ok(/function fresh\(\)\{return \{[\s\S]*?rates:\[\][\s\S]*?docs:\[\]/.test(app), 'A fresh development session must not contain fake catalog or knowledge rows');
assert.ok(/tripwise-server-cache-v1/.test(app+sync), 'Only the server cache may be used for offline read-only display');
assert.ok(!/tripwise-demo-v1/.test(app), 'The legacy browser demo store must not be the source of truth');
assert.ok(!/Khám phá hành trình mẫu|Dữ liệu mẫu|Tạo phương án mẫu|chế độ mô phỏng/.test(app+redesign), 'Visible actions and copy must not advertise simulated workflows');
assert.ok(/async function hydrateFromServer\(\{allowImport=false\}=\{\}\)/.test(sync), 'Hydration must never import browser fixtures into an empty database');
assert.ok(!/importDemo\(|importCatalog\(/.test(sync), 'Server hydration must not seed demo trips or catalog data');
assert.ok(/state=\{\.\.\.state,trips:\[\],selected:null,rates:\[\],docs:\[\]\}/.test(sync), 'Without server or cache data, offline state must be empty');
assert.ok(/if\(button\.dataset\.fix\)/.test(sync), 'Schedule repair must write its change through the backend API');
assert.ok(/button\.dataset\.action==='approve'[\s\S]*?api\.updateTrip/.test(sync), 'Review approval must persist through the backend API');
assert.ok(/allCursorPages\(api\.listTrips\)/.test(sync), 'Trip hydration must follow every server cursor page');
assert.ok(/allNumberedPages\(api\.listCatalog\)/.test(sync), 'Catalog hydration must follow every server page');
assert.ok(/function save\(\)\{return false\}/.test(app), 'Legacy local mutation paths must not persist to browser storage');
assert.ok(!/localStorage/.test(app), 'The legacy app shell must not read or write trip records in browser storage');
assert.ok(/api\.runAgent\(tripId,instruction,runId,api\.agentTimeoutForDays\(t\.days\)\)/.test(sync), 'Creating a trip with the assistant must call the backend agent endpoint with a configured timeout');
assert.ok(!/travel:20/.test(sync), 'Activities must not get an invented 20-minute travel estimate');
assert.ok(!/Di chuyển đến điểm kế tiếp \(phút\)/.test(sync), 'The activity form must not ask for a field the backend does not persist');
assert.ok(!/Ước tính mẫu|Lịch trình minh họa/.test(redesign), 'The UI must not present fixture travel times or sample itinerary labels as real trip data');
assert.ok(/Thời gian di chuyển chưa được thiết lập/.test(redesign), 'The UI must not derive travel time from missing backend data');
assert.ok(!/Thử một yêu cầu mẫu|Chọn tour mẫu|Seoul cho gia đình|Bản thử nghiệm chưa tự phân tích/.test(redesign), 'The active development UI must not expose the legacy simulated intake flow');
assert.ok(!/Đơn giá mẫu|Giá minh họa|Dữ liệu minh họa|Bảng giá mẫu nội bộ/.test(app+redesign), 'The UI must not label server catalog prices as fake examples');
assert.ok(!/Mức giá giả lập|Đơn giá giả lập|Mức giá minh họa/.test(redesign), 'Quote service discovery must not offer hard-coded fake prices');
assert.ok(!/Tạo phương án mẫu|Khám phá hành trình mẫu/.test(redesign), 'The redesigned UI must not expose sample generation');
assert.ok(!/Môi trường phát triển/.test(html), 'The app shell must not expose deployment-only environment labels');
assert.ok(!/Bản mẫu tương tác|Dữ liệu minh họa, lưu trên trình duyệt|Lưu trên thiết bị/.test(html), 'The app shell must not claim demo or browser-only persistence');

console.log('qa-dev-mode: 25 assertions passed');

