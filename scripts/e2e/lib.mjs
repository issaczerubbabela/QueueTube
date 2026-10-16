// Shared helpers for the 1.2 end-to-end checks. Every browser is launched muted.
import { chromium } from 'playwright-core';
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

export const S = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
export const ROOT = path.resolve(S, '..');
export const DIST = 'D:/Repositories/QueueTube/dist';
export const CHROME = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
export const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
export const VIDEOS = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'OPf0YbXqDm0', 'fJ9rUzIMcZQ'];
export const watch = (id) => `https://www.youtube.com/watch?v=${id}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const results = [];
export function check(name, ok, extra = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  — ' + extra : ''}`);
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log('Failed:\n' + failed.map((f) => '  ' + f.name).join('\n'));
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

// ── Chromium ────────────────────────────────────────────────────────────────

export async function launchChromium(name, { headed = false, ext = DIST, args = [] } = {}) {
  const profile = path.join(ROOT, 'profiles', name);
  fs.rmSync(profile, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    headless: false,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    args: [...(headed ? [] : ['--headless=new']), '--mute-audio', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, ...args],
  });
  await ctx.addCookies([
    { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/' },
    { name: 'PREF', value: 'f6=400', domain: '.youtube.com', path: '/' },
  ]);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  // Close the Guide tab a fresh install opens.
  await sleep(1500);
  for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();
  return { ctx, sw, id, profile };
}

export const queueIds = async (sw) => {
  const { queue } = await sw.evaluate(() => chrome.storage.local.get('queue'));
  return (queue?.entries ?? []).map((e) => e.videoId);
};
export const queueState = async (sw) => (await sw.evaluate(() => chrome.storage.local.get('queue'))).queue;

/** Sends a Command from an extension page, as the UI does. */
export async function command(ctx, id, cmd) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/src/popup/index.html`);
  const reply = await page.evaluate((c) => chrome.runtime.sendMessage(c), cmd);
  await page.close();
  return reply;
}

/** Process ids of a Playwright Chromium (by its profile dir) or of Firefox (by its profile dir). */
export function processIds(profileFragment, exe = 'chrome.exe') {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "name='${exe}'" | Where-Object { $_.CommandLine -like '*${profileFragment.replace(/\//g, '\\')}*' -or $_.CommandLine -like '*${profileFragment.replace(/\\/g, '/')}*' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' });
  return out.split(/\s+/).filter(Boolean).map(Number);
}

/** Reads the open native context menu and, optionally, clicks through `itemPath`. */
export function nativeMenu(pids, itemPath = []) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(S, 'menu.ps1'), '-Pids', pids.join(',')];
  if (itemPath.length) args.push('-ItemPath', itemPath.join('|'));
  const out = execFileSync('powershell', args, { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

// ── Firefox ─────────────────────────────────────────────────────────────────

export async function launchFirefox({ headed = false, executablePath = FIREFOX, prefs = {}, args = [] } = {}) {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath,
    headless: !headed,
    args,
    defaultViewport: { width: 1400, height: 900 },
    extraPrefsFirefox: {
      'extensions.originControls.grantByDefault': true,
      'media.volume_scale': '0.0',
      ...prefs,
    },
  });
  const page = await browser.newPage();
  await page.goto('https://www.youtube.com/robots.txt');
  await page.setCookie(
    { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/' },
    { name: 'PREF', value: 'f6=400', domain: '.youtube.com', path: '/' }
  );
  return { browser, page };
}

export async function installFirefoxExtension(browser, ext = DIST) {
  const before = (await browser.pages()).length;
  await browser.installExtension(ext);
  // Close the Guide tab a fresh install opens.
  for (let i = 0; i < 20 && (await browser.pages()).length === before; i++) await sleep(200);
  const pages = await browser.pages();
  if (pages.length > before) await pages[pages.length - 1].close();
}

/** Rows in the panel, by video id (read from the thumbnails). */
export async function panelVideoIds(page, pierce = '>>>') {
  const sel = pierce === '>>>' ? '#queuetube-host >>> li.row img' : '#queuetube-host li.row img';
  return page.$$eval(sel, (imgs) => imgs.map((i) => (i.src.match(/vi\/([\w-]{11})\//) || [])[1]));
}

/** A minimal Marionette client, for running script in Firefox's own (chrome) context, e.g. its context menu. */
export async function marionette(port = 2828) {
  const net = await import('net');
  const socket = await until(() => new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  }), 15000);
  let buffer = '';
  const waiting = new Map();
  let greeted;
  const greeting = new Promise((r) => (greeted = r));
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const colon = buffer.indexOf(':');
      if (colon < 0) return;
      const len = Number(buffer.slice(0, colon));
      if (Buffer.byteLength(buffer.slice(colon + 1)) < len) return;
      const bytes = Buffer.from(buffer.slice(colon + 1));
      const body = bytes.subarray(0, len).toString('utf8');
      buffer = bytes.subarray(len).toString('utf8');
      const msg = JSON.parse(body);
      if (!Array.isArray(msg)) greeted(msg);
      else waiting.get(msg[1])?.(msg), waiting.delete(msg[1]);
    }
  });
  await greeting;
  let next = 1;
  const send = (name, params = {}) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, ([, , error, result]) => (error ? reject(new Error(JSON.stringify(error))) : resolve(result)));
    const body = JSON.stringify([0, id, name, params]);
    socket.write(`${Buffer.byteLength(body)}:${body}`);
  });
  await send('WebDriver:NewSession', { capabilities: {} });
  await send('Marionette:SetContext', { value: 'chrome' });
  return {
    /** Runs `script` (a function body; `arguments` holds args) in the browser window's chrome context. */
    run: async (script, args = []) => (await send('WebDriver:ExecuteScript', { script, args, sandbox: 'system' }))?.value,
    close: () => socket.destroy(),
  };
}
