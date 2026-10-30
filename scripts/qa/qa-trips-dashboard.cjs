const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('frontend/redesign.js', 'utf8');
const css = fs.readFileSync('frontend/redesign.css', 'utf8');
const tripsRenderer = js.slice(js.indexOf('function redesignedTrips()'), js.indexOf('renderTrips=redesignedTrips'));

assert.match(js, /class="trips-dashboard"/, 'Trips route must have a scoped dashboard root');
assert.match(js, /class="trip-spotlight"/, 'Active trip must render as the destination spotlight');
assert.match(js, /assets\/seoul\.jpg/, 'Spotlight must reuse the local Seoul destination image');
assert.match(js, /class="[^"]*trip-queue[^"]*"/, 'Trip list must render as the advisor queue');
assert.match(js, /id="trip-search"|search\('trip-search'/, 'Search behavior hook must remain present');
assert.match(js, /id="status-filter"/, 'Status filter hook must remain present');
assert.match(js, /data-pipeline=/, 'Pipeline filters must remain interactive');
assert.match(js, /data-open=/, 'Open-trip behavior hook must remain present');
assert.match(js, /id="new-trip"|btn\([^\n]*'new-trip'/, 'Create-trip behavior hook must remain present');
assert.match(tripsRenderer, /<option value="ACTIVE">Đang thực hiện<\/option>/, 'Status filter must expose one combined in-progress option');
assert.doesNotMatch(tripsRenderer, /<option value="(?:NEW|DRAFT)">/, 'Status filter must not expose internal workflow states');
assert.match(tripsRenderer, /class="pipeline-icon"/, 'Pipeline cards must use a dedicated icon tile');
assert.match(tripsRenderer, /class="pipeline-copy"/, 'Pipeline cards must group label and supporting context');
assert.match(tripsRenderer, /pageSize=10/, 'Trip list must use ten trips per page');
assert.match(tripsRenderer, /data-trip-page=/, 'Trip list must expose previous and next pagination controls');
assert.match(tripsRenderer, /slice\(\(page-1\)\*pageSize,page\*pageSize\)/, 'Trip list must render only the active page');
assert.match(tripsRenderer, /tripwiseSync/, 'Trip data status must reflect the active backend synchronization state');
assert.doesNotMatch(tripsRenderer, /Dữ liệu bản thử nghiệm · chưa đồng bộ/, 'Trip data status must not be hard-coded as unsynchronized');
assert.match(css, /\.trip-pagination/, 'Trip pagination must have dedicated layout styles');

assert.match(css, /\.trips-dashboard/, 'Dashboard styles must be scoped');
assert.match(css, /\.trip-spotlight/, 'Spotlight must have dedicated styling');
assert.match(css, /@media\(max-width:600px\)[\s\S]*\.trip-spotlight/, 'Spotlight must define a phone layout');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Reduced-motion behavior must remain explicit');

console.log('qa-trips-dashboard: 23 assertions passed');
