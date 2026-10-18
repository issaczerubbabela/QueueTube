// #19 Share the Queue as a YouTube link, in headless Firefox over Marionette on real YouTube.
// This is also the ticket's "check first": does YouTube still open watch_videos links as a
// playlist, in order?
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clipboardText,
  currentVideo,
  entryId,
  panelMenuReal,
  playable,
  queueState,
  sleep,
  summary,
  toast,
  until,
  watch,
  withCue,
  video,
} from './lib.mjs';

const [V0, V1] = VIDEOS;
const ff = await withCue(launch, 'share-firefox');
const queued = async () => (await queueState(ff)).entries.map((e) => e.videoId);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idsIn = (url) => (new URL(url).searchParams.get('video_ids') ?? '').split(',').filter(Boolean);

/** Runs `script` on Cue's settings page in a tab of its own (left open); returns its handle. */
async function openSettings() {
  const handle = await ff.newTab();
  await ff.goto(`${await ff.extBase()}/src/options/index.html#queue`);
  await until(() => ff.eval(`return Boolean(document.querySelector('#setting-share'))`), 10000);
  return handle;
}

try {
  await ff.command({ type: 'queue/add', videoIds: VIDEOS });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  await playable(ff);
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V1) });
  await until(async () => (await currentVideo(ff)) === V1 && new URL(await ff.url()).searchParams.get('v') === V1, 20000);
  check('the second entry plays', await playable(ff));
  // It is the 19-second video: pause it so it doesn't end and reload the page mid-check.
  await video(ff, 'v.pause(); return true');

  // ── Copy share link from the panel ──
  check('Copy share link is in the panel’s ⋮ menu', await panelMenuReal(ff, 'Copy share link'));
  const shared = VIDEOS.slice(1);
  check('…and says it copied the rest of the queue', await until(async () => (await toast(ff)) === `Share link copied (${shared.length} videos)`, 5000), await toast(ff));
  const link = await until(() => clipboardText(ff), 5000);
  check('the clipboard holds a watch_videos link of the current entry and the ones after it', link?.startsWith('https://www.youtube.com/watch_videos?video_ids=') && same(idsIn(link), shared), link);

  // ── The link opens on YouTube and plays the shared videos in order ──
  const before = await ff.handles();
  await ff.command({ type: 'tabs/openFree', url: link });
  const tab = await until(async () => (await ff.handles()).find((h) => !before.includes(h)), 10000);
  await ff.switchTo(tab);
  const landed = await until(async () => {
    const url = new URL(await ff.url());
    return url.pathname === '/watch' && url.searchParams.get('list') && url;
  }, 30000);
  check('YouTube opens the link as a playlist', landed, landed && landed.href);
  check('…starting at the first shared video', landed && landed.searchParams.get('v') === shared[0], landed && landed.searchParams.get('v'));
  const panelIds = await until(async () => {
    const ids = await ff.eval(`return [...document.querySelectorAll('ytd-playlist-panel-renderer#playlist ytd-playlist-panel-video-renderer a#wc-endpoint')].map((a) => new URL(a.href).searchParams.get('v'))`);
    return ids?.length >= shared.length && ids;
  }, 20000);
  check('…listing the shared videos in order in YouTube’s playlist panel', panelIds && same([...new Set(panelIds)].slice(0, shared.length), shared), panelIds);
  check('…in a tab Cue leaves alone (not Auto-queued)', (await ff.handles()).includes(tab) && same(await queued(), VIDEOS));
  await ff.closeTab();
  await ff.switchTo(player);

  // ── Pasting a share link into Import ──
  await ff.command({ type: 'queue/clear' });
  const settings = await openSettings();
  await ff.eval(`document.querySelector('#setting-paste input').focus(); return true`);
  await ff.typeText(link);
  await ff.keys(['']); // Enter
  check('pasting a share link into Paste links queues its videos', await until(async () => same(await queued(), shared), 10000), await queued());
  check('…and says how many', /Added 5 videos/.test(await ff.eval(`return document.querySelector('.notice')?.textContent ?? ''`)), await ff.eval(`return document.querySelector('.notice')?.textContent`));

  // ── More than 50: the first 50, and it says so (from settings) ──
  await ff.command({ type: 'settings/update', patch: { lookUpDurations: false } });
  await ff.command({ type: 'queue/clear' });
  const many = Array.from({ length: 73 }, (_, i) => `cueShare${String(i).padStart(3, '0')}`);
  await ff.command({ type: 'queue/add', videoIds: many });
  await until(async () => (await queued()).length === 73, 10000);
  await ff.switchTo(settings);
  await sleep(500);
  const { x, y } = await ff.center('#setting-share button');
  await ff.pointer(x, y);
  check('settings has Copy share link, which says "Shared first 50 of 73"', await until(() => ff.eval(`return /Shared first 50 of 73/.test(document.querySelector('.notice')?.textContent ?? '')`), 5000), await ff.eval(`return document.querySelector('.notice')?.textContent`));
  const capped = await until(async () => {
    const text = await clipboardText(ff);
    return text !== link && text;
  }, 5000);
  check('…copying a link of the first 50 (the whole queue, as nothing is current)', capped && same(idsIn(capped), many.slice(0, 50)), capped && idsIn(capped).length);
  await ff.closeTab();
  await ff.switchTo(player);
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
