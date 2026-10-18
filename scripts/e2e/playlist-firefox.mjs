// #16 Queue a playlist, in headless Firefox over Marionette on real YouTube. It finds a short
// (under 100 videos, one page) and a long (more than one page) public playlist in YouTube's
// search results, or uses CUE_E2E_PLAYLIST / CUE_E2E_BIG_PLAYLIST. It also saves the long one's
// page data to <profiles>/playlist-capture.json, for refreshing the unit-test fixture.
import fs from 'fs';
import path from 'path';
import { contextMenu, launch } from './ff.mjs';
import {
  PROFILES,
  VIDEOS,
  check,
  currentVideo,
  openFresh,
  panelMenu,
  playable,
  queueState,
  serve,
  sleep,
  summary,
  toast,
  until,
  watch,
  withCue,
} from './lib.mjs';

const [V0] = VIDEOS;
const ff = await withCue(launch, 'playlist-firefox');

// ── Reading playlist pages the way the extension does, to know what to expect ──

function pageData(html) {
  const at = html.search(/(?:var\s+ytInitialData|window\[["']ytInitialData["']\]|\bytInitialData)\s*=\s*\{/);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  let depth = 0, inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; }
    else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return null;
}
function firstPage(data) {
  const ids = [];
  let more = false;
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    if (n.playlistVideoRenderer?.videoId) {
      if (n.playlistVideoRenderer.isPlayable !== false && !ids.includes(n.playlistVideoRenderer.videoId)) ids.push(n.playlistVideoRenderer.videoId);
      return;
    }
    // YouTube's newer layout, which it serves for some playlist pages.
    if (n.lockupViewModel?.contentId) {
      if (n.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && !ids.includes(n.lockupViewModel.contentId)) ids.push(n.lockupViewModel.contentId);
      return;
    }
    if (n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) more = true;
    if (n.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token) more = true;
    Object.values(n).forEach(walk);
  };
  walk(data);
  return { ids, more };
}
/** Fetches a YouTube page from a YouTube tab (same origin) and returns its HTML. */
const fetchPage = (url) =>
  ff.evalAsync(`const [url, done] = arguments; fetch(url, { credentials: 'omit' }).then((r) => r.text()).then(done, (e) => done('ERROR ' + e));`, [url]);

async function findPlaylists() {
  const found = { small: process.env.CUE_E2E_PLAYLIST ?? null, big: process.env.CUE_E2E_BIG_PLAYLIST ?? null };
  if (found.small && found.big) return found;
  const candidates = new Set();
  for (const q of ['music playlist', 'full album playlist', 'top songs playlist', 'lofi playlist', 'documentary playlist']) {
    const html = await fetchPage(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAw%253D%253D`);
    for (const m of html.matchAll(/[?&]list=([\w-]{10,64})/g)) if (!m[1].startsWith('RD')) candidates.add(m[1]);
    if (candidates.size >= 20) break;
  }
  for (const id of candidates) {
    if (found.small && found.big) break;
    const page = firstPage(pageData(await fetchPage(`https://www.youtube.com/playlist?list=${id}`)));
    if (!found.big && page.more) found.big = id;
    else if (!found.small && !page.more && page.ids.length >= 3 && page.ids.length <= 60) found.small = id;
  }
  return found;
}

const ids = async () => (await queueState(ff)).entries.map((e) => e.videoId);
const alertText = () => until(() => ff.send('WebDriver:GetAlertText').then((r) => r.value), 30000, 300);
const button = (script) => ff.eval(`const b = document.querySelector('#queuetube-host-playlist')?.shadowRoot?.querySelector('button'); ${script}`);

try {
  await ff.command({ type: 'queue/add', videoIds: [V0] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the player plays a video', await playable(ff));

  const { small, big } = await findPlaylists();
  check('found a short public playlist (set CUE_E2E_PLAYLIST to choose one)', small, small);
  check('found a long public playlist (set CUE_E2E_BIG_PLAYLIST to choose one)', big, big);
  const smallIds = firstPage(pageData(await fetchPage(`https://www.youtube.com/playlist?list=${small}`))).ids;
  const bigHtml = await fetchPage(`https://www.youtube.com/playlist?list=${big}`);
  const bigFirst = firstPage(pageData(bigHtml)).ids;
  fs.mkdirSync(PROFILES, { recursive: true });
  fs.writeFileSync(path.join(PROFILES, 'playlist-capture.json'), JSON.stringify(pageData(bigHtml), null, 1));
  console.log('  saved', path.join(PROFILES, 'playlist-capture.json'));

  // ── Right-click a playlist link on any site ──
  const { server, origin } = await serve({
    '/': `<!doctype html><body style="font:18px sans-serif;padding:30px;line-height:2">
      <p><a id="small" href="https://www.youtube.com/playlist?list=${small}">a short playlist</a></p>
      <p><a id="big" href="https://www.youtube.com/watch?v=${bigFirst[0]}&list=${big}">a video in a long playlist</a></p>
      <p><a id="video" href="https://www.youtube.com/watch?v=${V0}">a plain video</a></p></body>`,
  });
  const site = await ff.newTab();
  await ff.goto(origin);
  const plain = await contextMenu(ff, ...Object.values(await ff.center('#video')));
  check('a plain video link has no playlist item', !plain.labels.includes('Add playlist to queue'), plain.labels);
  const watchInList = await contextMenu(ff, ...Object.values(await ff.center('#big')));
  check('a video link with list= offers both the video and the playlist', watchInList.labels.includes('Add to queue') && watchInList.labels.includes('Add playlist to queue'), watchInList.labels);
  const clicked = await contextMenu(ff, ...Object.values(await ff.center('#small')), 'Add playlist to queue');
  check('right-click a playlist link: Add playlist to queue', clicked.clicked, clicked.labels);
  const want = [V0, ...smallIds.filter((v) => v !== V0)];
  check(`…queues the whole playlist (${smallIds.length} videos), in order`, await until(async () => JSON.stringify(await ids()) === JSON.stringify(want), 30000), { got: await ids(), want });
  check('…with titles and lengths straight from the playlist', (await queueState(ff)).entries.slice(1).every((e) => e.title && e.durationSec));

  // More than 100 asks first, in the page the right-click came from.
  const before = (await ids()).length;
  await contextMenu(ff, ...Object.values(await ff.center('#big')), 'Add playlist to queue');
  const question = await alertText();
  check('a long playlist asks first: "Queue all N videos?"', /^Queue all \d+ videos\?$/.test(question ?? '') && Number(/\d+/.exec(question)[0]) > 100, question);
  await ff.send('WebDriver:DismissAlert');
  await sleep(1500);
  check('…and declining queues nothing', (await ids()).length === before);
  await ff.closeTab();
  server.close();
  await ff.switchTo(player);

  // ── The button on a /playlist page ──
  await ff.newTab();
  await ff.goto(`https://www.youtube.com/playlist?list=${big}`);
  check('a /playlist page shows a Queue this playlist button', await until(() => button(`return b?.textContent.trim() === 'Queue this playlist'`), 15000));
  await button('b.click(); return true');
  const asked = await alertText();
  check('…which asks first for a long playlist', /^Queue all \d+ videos\?$/.test(asked ?? ''), asked);
  const total = Number(/\d+/.exec(asked ?? '0')[0]);
  await ff.send('WebDriver:AcceptAlert');
  const label = await until(() => button(`return /^Queued/.test(b.textContent.trim()) && b.textContent.trim()`), 60000);
  check('…and says what it queued', label, label);
  const queued = await ids();
  check(`…queueing all ${total} videos, beyond the first page`, queued.length >= before + total - 2 && total > 100, { queued: queued.length, before, total });
  const firstHundred = bigFirst.filter((v) => !want.includes(v));
  check('…in playlist order', JSON.stringify(queued.slice(before, before + 20)) === JSON.stringify(firstHundred.slice(0, 20)), { got: queued.slice(before, before + 5), want: firstHundred.slice(0, 5) });
  await ff.closeTab();
  await ff.switchTo(player);

  // ── In the panel, while the player plays from a playlist ──
  await ff.command({ type: 'queue/clear' });
  check('the panel offers nothing for a video outside a playlist', !(await panelMenu(ff, 'Queue this playlist')));
  await ff.goto(watch(smallIds[0], `&list=${small}`));
  await until(async () => new URL(await ff.url()).searchParams.get('list') === small, 20000);
  await playable(ff);
  check('playing from a playlist, the panel offers Queue this playlist', await panelMenu(ff, 'Queue this playlist'));
  check('…which queues it in order', await until(async () => JSON.stringify(await ids()) === JSON.stringify(smallIds), 30000), await ids());
  check('…and says so', await until(async () => /^Queued \d+ videos? from the playlist/.test((await toast(ff)) ?? ''), 5000), await toast(ff));
  await panelMenu(ff, 'Queue this playlist');
  check('queueing it again adds nothing (Allow duplicates is off)', await until(async () => /already queued/.test((await toast(ff)) ?? ''), 15000) && (await ids()).length === smallIds.length, await toast(ff));

  // ── A fresh tab with a playlist video still queues only that video ──
  await ff.command({ type: 'queue/clear' });
  await ff.command({ type: 'queue/add', videoIds: [V0] });
  check('a fresh tab opening watch?v=X&list=Y is Auto-queued', await openFresh(ff, watch(bigFirst[1], `&list=${big}`), player));
  check('…queueing only X', await until(async () => JSON.stringify(await ids()) === JSON.stringify([V0, bigFirst[1]]), 10000), await ids());
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
