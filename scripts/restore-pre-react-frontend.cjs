const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sessionFile = 'C:/Users/ACER/.codex/sessions/2026/10/27/rollout-2026-10-27T08-52-07-01a17b0e-c487-7120-aecb-93d874b5d6e4.jsonl';
const prototypeFile = path.join(root, 'frontend-original', 'Tripwise-Prototype.html');
const outputDir = path.join(root, 'frontend-vanilla-restored');
const events = fs.readFileSync(sessionFile, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const prototype = fs.readFileSync(prototypeFile, 'utf8');

function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function applyUnifiedDiff(source, diff, label) {
  let lines = normalize(source).split('\n');
  const patchLines = normalize(diff).split('\n');
  let cursor = 0;

  while (cursor < patchLines.length) {
    const header = patchLines[cursor].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!header) { cursor += 1; continue; }
    cursor += 1;
    const oldStart = Number(header[1]) - 1;
    const replacement = [];
    const expected = [];
    while (cursor < patchLines.length && !patchLines[cursor].startsWith('@@ ')) {
      const line = patchLines[cursor++];
      if (line.startsWith(' ')) { expected.push(line.slice(1)); replacement.push(line.slice(1)); }
      else if (line.startsWith('-')) expected.push(line.slice(1));
      else if (line.startsWith('+')) replacement.push(line.slice(1));
      else if (line === '\\ No newline at end of file') continue;
    }
    let applyAt = oldStart;
    const expectedText = expected.join('\n');
    const actual = lines.slice(applyAt, applyAt + expected.length).join('\n');
    if (actual !== expectedText) {
      applyAt = -1;
      for (let candidate = 0; candidate <= lines.length - expected.length; candidate += 1) {
        if (lines.slice(candidate, candidate + expected.length).join('\n') === expectedText) {
          applyAt = candidate;
          break;
        }
      }
    }
    if (applyAt < 0) throw new Error(`Cannot replay ${label} near old line ${oldStart + 1}`);
    lines.splice(applyAt, expected.length, ...replacement);
  }
  return lines.join('\n');
}

function changesFor(fileName, after = '') {
  const result = [];
  for (const event of events) {
    if (after && event.timestamp <= after) continue;
    const item = event.payload?.item;
    if (item?.type !== 'FileChange') continue;
    for (const [filePath, change] of Object.entries(item.changes || {})) {
      if (filePath.replace(/\\/g, '/').endsWith(`/dist/${fileName}`)) result.push({ timestamp: event.timestamp, change });
    }
  }
  return result;
}

function capturedOutput(timestamp) {
  const event = events.find((entry) => entry.timestamp === timestamp);
  const output = event?.payload?.item?.aggregated_output;
  if (!output) throw new Error(`Missing captured output ${timestamp}`);
  return normalize(output).replace(/\n$/, '');
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });

const styleMatch = prototype.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = prototype.match(/<script>([\s\S]*?)<\/script>/);
if (!styleMatch || !scriptMatch) throw new Error('Prototype source blocks are missing');

const dataImages = [...prototype.matchAll(/data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)/g)];
const jpeg = dataImages.find((match) => match[1] === 'jpeg');
const png = dataImages.find((match) => match[1] === 'png');
if (!jpeg || !png) throw new Error('Prototype assets are missing');
fs.writeFileSync(path.join(outputDir, 'assets', 'seoul.jpg'), Buffer.from(jpeg[2], 'base64'));
fs.writeFileSync(path.join(outputDir, 'assets', 'ikigai.png'), Buffer.from(png[2], 'base64'));

const appCaptureTime = '2026-10-27T04:51:14.526Z';
const appCapture = capturedOutput(appCaptureTime);
let appJs = appCapture.slice(appCapture.lastIndexOf("'use strict';"));
for (const { timestamp, change } of changesFor('app.js', appCaptureTime)) {
  if (change.type === 'update') appJs = applyUnifiedDiff(appJs, change.unified_diff, `app.js ${timestamp}`);
}

const redesignCaptureTime = '2026-10-27T08:45:04.472Z';
let redesignJs = capturedOutput(redesignCaptureTime);
for (const { timestamp, change } of changesFor('redesign.js', redesignCaptureTime)) {
  if (change.type === 'update') redesignJs = applyUnifiedDiff(redesignJs, change.unified_diff, `redesign.js ${timestamp}`);
}

let apiClient = '';
for (const { timestamp, change } of changesFor('api-client.js')) {
  if (change.type === 'add') apiClient = normalize(change.content);
  else if (change.type === 'update') apiClient = applyUnifiedDiff(apiClient, change.unified_diff, `api-client.js ${timestamp}`);
}

let apiSync = '';
for (const { timestamp, change } of changesFor('api-sync.js')) {
  if (change.type === 'add') apiSync = normalize(change.content);
  else if (change.type === 'update') apiSync = applyUnifiedDiff(apiSync, change.unified_diff, `api-sync.js ${timestamp}`);
}

// Recover the recorded redesign rules that are available verbatim, then replay all later additions.
const cssCapture = capturedOutput('2026-10-27T02:16:57.588Z');
const cssLines = new Map();
const blocks = cssCapture.split(/\n--- line (\d+) ---\n/);
for (let i = 1; i < blocks.length; i += 2) {
  const matchedLine = Number(blocks[i]);
  let index = Math.max(0, matchedLine - 9);
  for (const line of blocks[i + 1].split('\n')) cssLines.set(index++, line);
}
const tail = capturedOutput('2026-10-27T02:18:42.795Z').split('\n');
for (let i = 0; i < tail.length; i += 1) cssLines.set(252 - tail.length + i, tail[i]);
let redesignCss = [...cssLines.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]).join('\n');
for (const { change } of changesFor('redesign.css')) {
  if (change.type !== 'update') continue;
  const additions = normalize(change.unified_diff).split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
  if (additions.length) redesignCss += `\n${additions.join('\n')}\n`;
}

const indexHtml = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tripwise — Không gian tư vấn</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="redesign.css"></head><body><aside class="sidebar"><a class="brand" href="#trips"><span class="mark">t↗</span><span>tripwise<small>BY IKIGAI</small></span></a><p class="nav-label">KHÔNG GIAN LÀM VIỆC</p><nav aria-label="Điều hướng"><a href="#trips" data-nav="trips"><i>▦</i><span>Chuyến đi</span></a><a href="#workspace" data-nav="workspace"><i>✧</i><span>Không gian tư vấn</span></a><a href="#knowledge" data-nav="knowledge"><i>▤</i><span>Kho tri thức</span></a><a href="#rates" data-nav="rates"><i>₫</i><span>Danh mục nhà cung cấp</span></a></nav><div class="side-bottom"><div class="demo">● &nbsp; Bản mẫu tương tác</div><p>Dữ liệu minh họa, lưu trên trình duyệt của bạn.</p><a href="#settings">⚙ &nbsp; Cài đặt & dữ liệu</a><div class="profile"><span class="avatar">K</span><div><b>Tuấn Khôi</b><small>Nhân viên tư vấn</small></div></div></div></aside><div class="shell"><header class="topbar"><div class="crumb">Không gian làm việc <span>/</span> <b id="route-label">Chuyến đi</b></div><div class="top-right"><small>● &nbsp; Lưu trên thiết bị</small><img src="assets/ikigai.png" alt="IKIGAI"></div></header><main id="app" tabindex="-1"></main><footer>Tripwise <span>Thiết kế hành trình theo cách của bạn.</span><small>Bản xem trước sản phẩm</small></footer></div><dialog id="modal"><div class="modal-head"><h2 id="modal-title"></h2><button class="icon-btn" id="close-modal" aria-label="Đóng">×</button></div><div id="modal-body"></div></dialog><div id="toast" role="status" aria-live="polite"></div><script src="app.js"></script><script src="redesign.js"></script>${apiClient ? '<script src="runtime-config.js"></script><script src="api-client.js"></script>' : ''}${apiSync ? '<script src="api-sync.js"></script>' : ''}</body></html>`;

fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(outputDir, 'styles.css'), normalize(styleMatch[1]), 'utf8');
fs.writeFileSync(path.join(outputDir, 'redesign.css'), redesignCss, 'utf8');
fs.writeFileSync(path.join(outputDir, 'app.js'), appJs, 'utf8');
fs.writeFileSync(path.join(outputDir, 'redesign.js'), redesignJs, 'utf8');
if (apiClient) fs.writeFileSync(path.join(outputDir, 'api-client.js'), apiClient, 'utf8');
if (apiSync) fs.writeFileSync(path.join(outputDir, 'api-sync.js'), apiSync, 'utf8');
if (apiClient) fs.copyFileSync(path.join(root, 'dist', 'runtime-config.js'), path.join(outputDir, 'runtime-config.js'));

console.log(JSON.stringify({ outputDir, files: fs.readdirSync(outputDir) }, null, 2));
