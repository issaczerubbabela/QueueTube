// Shared helpers for the end-to-end checks (headless Firefox over Marionette, see ff.mjs). No npm
// dependencies. Every browser is launched muted.
//
// Paths can be set with environment variables:
//   FIREFOX            path to the Firefox executable (default: the usual install location)
//   CUE_DIST           the built extension (default: <repo>/dist; run `npm run build` first)
//   CUE_E2E_PROFILES   where test profiles go (default: scripts/e2e/.profiles, git-ignored)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

export const S = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(S, '../..');
export const DIST = process.env.CUE_DIST ?? path.join(ROOT, 'dist');
export const PROFILES = process.env.CUE_E2E_PROFILES ?? path.join(S, '.profiles');
export const FIREFOX =
  process.env.FIREFOX ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Mozilla Firefox/firefox.exe'
    : process.platform === 'darwin'
      ? '/Applications/Firefox.app/Contents/MacOS/firefox'
      : 'firefox');

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
  console.error(`No built extension at ${DIST}. Run \`npm run build\` first, or set CUE_DIST.`);
  process.exit(2);
}

/**
 * Real videos with stable lengths: 3:33, 0:19, 4:12, 4:41, 4:30, 5:59. The second is shorter than
 * 30 seconds, so it never gets Watch progress before it is Watched.
 */
export const VIDEOS = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'OPf0YbXqDm0', 'fJ9rUzIMcZQ'];
export const watch = (id, extra = '') => `https://www.youtube.com/watch?v=${id}${extra}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const results = [];
export function check(name, ok, extra = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' && extra !== undefined ? '  — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`);
}
/** Prints the tally (run.mjs reads the "n/m passed" line) and sets the exit code. */
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log('Failed:\n' + failed.map((f) => '  ' + f.name).join('\n'));
  process.exitCode = failed.length || results.length === 0 ? 1 : 0;
}

export async function until(fn, timeout = 10000, every = 250) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => undefined);
    if (value) return value;
    if (Date.now() > end) return value;
    await sleep(every);
  }
}

/** A tiny local site (not YouTube) for right-click and drag tests. */
export function serve(files) {
  const server = http.createServer((req, res) => {
    const body = files[new URL(req.url, 'http://x').pathname];
    if (body === undefined) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

// ── Cue and YouTube, through an ff.mjs Firefox ──────────────────────────────

/** Starts Firefox with YouTube's consent cookies and Cue installed. Returns the Firefox. */
export async function withCue(launch, name, options = {}) {
  const ff = await launch(name, options);
  ff.extInWindow = true;
  await ff.setCookies();
  await ff.install();
  await sleep(2000);
  // A first install opens the Guide; close it so it isn't in the way.
  for (const handle of await ff.handles()) {
    await ff.switchTo(handle);
    if ((await ff.url()).startsWith('moz-extension:') && (await ff.handles()).length > 1) await ff.closeTab();
  }
  await ff.switchTo((await ff.handles())[0]);
  return ff;
}

/** One of Cue's storage.local values (queue, settings, progress, shelf…). */
export const stored = (ff, key) => ff.ext(`return (await browser.storage.local.get(${JSON.stringify(key)}))[${JSON.stringify(key)}] ?? null;`);

export async function queueState(ff) {
  return (await stored(ff, 'queue')) ?? { entries: [], currentId: null, history: [] };
}
export async function currentVideo(ff) {
  const q = await queueState(ff);
  return q.entries.find((e) => e.id === q.currentId)?.videoId ?? null;
}
export const entryId = async (ff, videoId) => (await queueState(ff)).entries.find((e) => e.videoId === videoId)?.id;

/** The video id in the current tab's URL. */
export const playing = async (ff) => new URL(await ff.url()).searchParams.get('v');

/** Waits for the main video to be playing real content (not an ad). Returns false on timeout. */
export const playable = (ff, timeout = 45000) =>
  until(
    () => ff.eval(`const v = document.querySelector('video.html5-main-video'); return Boolean(v && v.readyState >= 2 && !document.querySelector('#movie_player.ad-showing') && Number.isFinite(v.duration) && v.duration > 0 && (v.currentTime > 0.3 || v.paused))`),
    timeout,
    400
  );

/** Reads (and optionally changes) the main video: `script` sees it as `v`. */
export const video = (ff, script = 'return { time: v.currentTime, duration: v.duration, paused: v.paused, ended: v.ended }') =>
  ff.eval(`const v = document.querySelector('video.html5-main-video'); ${script}`);

/** Seeks the player and pauses there, which makes Cue report the position. */
export async function seekAndPause(ff, seconds) {
  await video(ff, `v.currentTime = ${seconds}; return true`);
  await until(() => video(ff, `return Math.abs(v.currentTime - ${seconds}) < 3 && v.readyState >= 2`), 15000);
  await video(ff, 'v.pause(); return true');
  await sleep(800);
}

/** Runs `script` in the queue panel's shadow root (`root`), returning its value. */
export const panel = (ff, script) =>
  ff.eval(`const root = document.querySelector('#queuetube-host')?.shadowRoot; if (!root) return null; ${script}`);

/** Video ids of the rows in the panel's visible list, read from their thumbnails. */
export const panelRows = (ff) =>
  panel(ff, `return [...root.querySelectorAll('li.row img')].map((i) => (i.src.match(/vi\\/([\\w-]{11})\\//) || [])[1]);`);

/** Clicks a button in the panel by its visible text or aria-label. */
export const clickPanelButton = (ff, label) =>
  panel(ff, `const b = [...root.querySelectorAll('button')].find((b) => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})); if (!b) return false; b.click(); return true;`);

/** Opens the panel's ⋮ menu and picks an item by its label. Returns false if it isn't there or is disabled. */
export async function panelMenu(ff, label) {
  await clickPanelButton(ff, 'Queue options') || (await panel(ff, `const b = root.querySelector('button[aria-label^="Queue options"]'); b?.click(); return Boolean(b);`));
  await sleep(300);
  const ok = await panel(ff, `const item = [...root.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}); if (!item || item.disabled) { root.querySelector('button[aria-label^="Queue options"]')?.click(); return false; } item.click(); return true;`);
  await sleep(300);
  return ok;
}

/** Opens a row's ⋮ menu (by video id) and picks an item. Returns false if it isn't there or is disabled. */
export async function rowMenu(ff, videoId, label) {
  const opened = await panel(ff, `const row = [...root.querySelectorAll('li.row')].find((r) => r.querySelector('img')?.src.includes('/vi/${videoId}/')); const b = row?.querySelector('.row-actions button'); b?.click(); return Boolean(b);`);
  if (!opened) return false;
  await sleep(300);
  const ok = await panel(ff, `const item = [...root.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}); if (!item || item.disabled) { document.body.click(); return false; } item.click(); return true;`);
  await sleep(300);
  return ok;
}

/** The text of the panel's toast, if one shows. */
export const toast = (ff) => panel(ff, `return root.querySelector('.toast .msg')?.textContent ?? null;`);

/** Opens `url` in a new (fresh) tab, as a middle-click would, then returns to `back`. Auto-queue closes the tab. */
export async function openFresh(ff, url, back) {
  const tab = await ff.newTab();
  // Cue may close the tab while it is still navigating.
  await ff.goto(url).catch(() => {});
  const closed = await until(async () => !(await ff.handles()).includes(tab), 15000);
  await ff.switchTo(back);
  return Boolean(closed);
}
