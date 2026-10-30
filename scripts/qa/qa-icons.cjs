const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('frontend/redesign.js', 'utf8');
const css = fs.readFileSync('frontend/redesign.css', 'utf8');

assert.match(js, /const svgIcons=\{/,
  'Icons should use an SVG markup registry so multi-part icons render correctly');
assert.match(js, /pin:'<path d="M20 10c0 5-5\.5 10\.1-7\.4 11\.8[^']+<circle cx="12" cy="10" r="3"\/>\'/,
  'The location icon should have a distinct, centered inner circle');
assert.match(js, /function ico\(k\).*svgIcons\[k\]\|\|svgIcons\.spark/,
  'The icon renderer should resolve the complete icon markup');
assert.match(js, /search=function\(id,ph,v=''\).*ico\('search'\)/,
  'Search controls should use the shared SVG icon instead of a font glyph');
assert.match(js, /side-bottom a\[href="#settings"\].*ico\('settings'\)/,
  'Settings navigation should use the shared SVG icon instead of a font glyph');

const registry = js.match(/const svgIcons=\{([\s\S]*?)\n\};/);
assert.ok(registry, 'Icon registry is present');
const defined = new Set([...registry[1].matchAll(/^([a-z]+):/gm)].map((match) => match[1]));
const used = new Set([...js.matchAll(/ico\('([a-z]+)'\)/g)].map((match) => match[1]));
for (const key of used) assert.ok(defined.has(key), `Missing icon definition: ${key}`);

assert.match(css, /\.tw-icon\{[^}]*width:18px[^}]*height:18px/,
  'All SVG icons should have a stable default size');
assert.match(css, /\.trip-queue \.trip-thumb \.tw-icon\{[^}]*width:18px[^}]*height:18px/,
  'Trip location icons should have an explicit size');
assert.match(css, /\.search>\.tw-icon\{[^}]*position:absolute[^}]*top:50%[^}]*transform:translateY\(-50%\)/,
  'Search icons should stay vertically centered inside the input');
assert.match(css, /\.search input\{[^}]*padding-left:34px/,
  'Search input text should leave room for its icon');

console.log(`Icon QA passed: ${defined.size} definitions, ${used.size} direct usages checked.`);
