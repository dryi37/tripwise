const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sessionPath = 'C:/Users/ACER/.codex/sessions/2026/10/27/rollout-2026-10-27T08-52-07-01a17b0e-c487-7120-aecb-93d874b5d6e4.jsonl';
const target = path.join(root, 'frontend-original', 'approved-2026-10-27');
const sourceDir = path.join(target, 'source-recovered');
const screenshotDir = path.join(target, 'screenshots');

fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

const events = fs.readFileSync(sessionPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

function commandOutput(timestamp) {
  const event = events.find((entry) => entry.timestamp === timestamp);
  const output = event?.payload?.item?.aggregated_output;
  if (!output) throw new Error(`Missing recorded output at ${timestamp}`);
  return output;
}

// This is the final complete renderer captured before the React migration.
fs.writeFileSync(
  path.join(sourceDir, 'redesign.js'),
  commandOutput('2026-10-27T08:45:04.472Z').replace(/\r?\n$/, '') + '\n',
  'utf8',
);

const screenshots = [
  ['trips-dashboard-approved.png', 'codex-clipboard-5653157a-9a0a-4ad7-a375-a429a8c4ab61.png'],
  ['service-catalog-approved.png', 'codex-clipboard-8d8d381a-0d49-4b7c-89f6-3861d9d2c19d.png'],
  ['workspace-quote-approved.png', 'codex-clipboard-338119cb-8bd9-4651-976a-936be13d6e20.png'],
];

for (const [name, original] of screenshots) {
  const from = path.join('C:/Users/ACER/AppData/Local/Temp', original);
  if (!fs.existsSync(from)) throw new Error(`Missing screenshot: ${from}`);
  fs.copyFileSync(from, path.join(screenshotDir, name));
}

console.log(`Recovered approved pre-React reference to ${target}`);
