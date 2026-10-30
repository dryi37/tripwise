const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync('frontend/redesign.css', 'utf8');

const requiredSelectors = [
  '.knowledge-explainer{',
  '.knowledge-emblem{',
  '.doc-metadata{',
  '.source-badge{',
  '.quote-source{display:',
  '.service-grid{',
  '.service-card{',
  '.service-top{',
  '.service-symbol{',
  '.service-provider{',
  '.service-price{',
  '.service-bottom{',
  '.preview-cover{',
  '.preview-facts{',
  '.preview-day{',
  '.preview-totals{',
];

for (const selector of requiredSelectors) {
  assert.ok(css.includes(selector), `Missing restored style block: ${selector}`);
}

assert.match(css, /\.unified-quote-table\{[^}]*table-layout:fixed/,
  'Quote columns should use a stable table layout');
assert.match(css, /\.quote-source\{[^}]*display:(?:flex|grid)[^}]*gap:/,
  'Supplier metadata should be separated instead of concatenated');
assert.match(css, /\.knowledge-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  'Knowledge cards should remain in the approved three-column grid');

console.log('Style restoration QA passed.');
