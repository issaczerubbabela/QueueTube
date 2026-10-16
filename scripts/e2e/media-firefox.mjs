// #7 Media keys and Shift+N follow the queue. Headless Firefox over Marionette; pass a firefox.exe
// path to run another version (e.g. 121). Media keys go through Firefox's own MediaController, the
// object hardware media keys and headphone buttons drive.
import { launch } from './ff.mjs';
import { VIDEOS, check, sleep, summary, until, watch } from './lib.mjs';

const exe = process.argv[2];
const [V0, V1, V2] = VIDEOS;
const ff = await launch('media-' + (exe ? 'old' : 'new'), exe ? { executablePath: exe } : {});
const SHIFT = '';

const playing = async () => new URL(await ff.url()).searchParams.get('v');
const attrs = () => ff.eval(`return { next: document.documentElement.dataset.cueNext ?? null, previous: document.documentElement.dataset.cuePrevious ?? null, page: document.documentElement.dataset.cuePageScript ?? null }`);
const media = async (method) => {
  // Firefox only routes keys to a controller that is active (audible media playing).
  await until(() => ff.chrome(`const c = gBrowser.selectedBrowser.browsingContext.mediaController; return c.isActive && c.isPlaying`), 20000);
  await sleep(300);
  return ff.chrome(`const c = gBrowser.selectedBrowser.browsingContext.mediaController; const keys = [...(c.supportedKeys ?? [])]; ${method ? `c.${method}();` : ''} return keys;`);
};
const attrsAre = async (label, want) => {
  const ok = await until(async () => {
    const a = await attrs();
    return Object.entries(want).every(([k, v]) => a[k] === v);
  }, 10000);
  check(label, ok, JSON.stringify(await attrs()));
};
const current = async () => {
  const q = await ff.ext(`return (await browser.storage.local.get('queue')).queue;`);
  return q.entries.find((e) => e.id === q.currentId)?.videoId ?? null;
};
/** Presses Shift+N; returns whether it got past Cue's listener (window capture, registered first) to the next one there. */
async function shiftN() {
  await ff.eval(`document.activeElement?.blur?.(); document.body.focus();
    document.documentElement.dataset.cueSaw = 'no';
    window.addEventListener('keydown', (e) => { if (e.key === 'N') document.documentElement.dataset.cueSaw = e.defaultPrevented ? 'prevented' : 'reached'; }, { capture: true, once: true });`);
  await ff.keys([SHIFT, 'N']);
  await sleep(150);
  return (await ff.eval(`return document.documentElement.dataset.cueSaw ?? null`).catch(() => null)) ?? 'navigated';
}
const waitFor = (label, fn, extra) => until(fn, 20000).then(async (ok) => check(label, ok, typeof extra === 'function' ? await extra() : extra));
const playable = () => until(() => ff.eval(`const v = document.querySelector('video.html5-main-video'); return v && v.currentTime > 0.5 && !document.querySelector('#movie_player.ad-showing')`), 30000);

try {
  check('Firefox version', true, await ff.chrome(`return Services.appinfo.version`));
  await ff.setCookies();
  await ff.install();
  if (exe) await ff.grantHosts('queuetube@issac.com', ['*://www.youtube.com/*', '*://youtube.com/*']);
  await sleep(2000);
  await ff.command({ type: 'queue/add', videoIds: [V0, V1, V2] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await current()) === V0, 20000);
  await playable();

  await attrsAre('page script runs in the page', { page: '1' });
  await attrsAre('marks next (V1 follows) but not previous', { next: '1', previous: null });
  const keys = await media();
  check('Firefox offers a next-track control on a plain video', keys.includes('nexttrack'), keys.join(','));

  // ── Media next / previous ──
  await media('nextTrack');
  await waitFor('media next plays the next entry', async () => (await playing()) === V1 && (await current()) === V1, playing);
  await playable();
  await attrsAre('…and now previous is offered', { previous: '1' });
  await media('prevTrack');
  await waitFor('media previous goes back like Cue’s Previous', async () => (await playing()) === V0 && (await current()) === V0, playing);
  await playable();

  // ── Shift+N ──
  const saw = await shiftN();
  check('Shift+N is kept from YouTube when the queue has a next', saw === 'no' || saw === 'navigated', saw);
  await waitFor('Shift+N plays the next entry', async () => (await playing()) === V1 && (await current()) === V1, playing);
  await playable();

  // ── Wandered off to a video that isn't queued ──
  const off = await until(() => ff.eval(`return [...document.querySelectorAll('#secondary a[href*="/watch?v="]')].map((a) => new URL(a.href).searchParams.get('v')).find((v) => v && !arguments[0].includes(v))`, [VIDEOS]), 30000);
  check('found a suggestion that is not queued', Boolean(off), off);
  await ff.goto(watch(off));
  await playable();
  check('wandering off keeps V1 as the current entry', (await current()) === V1);
  await attrsAre('next is still marked', { next: '1' });
  await media('nextTrack');
  await waitFor('media next returns to the queue: the entry after the current one', async () => (await playing()) === V2 && (await current()) === V2, playing);
  await playable();

  // ── Nothing after the current entry: YouTube's own behaviour ──
  await attrsAre('at the end of the queue, next is not marked (previous is)', { next: null, previous: '1' });
  const keys2 = await media();
  check('…so the next control is what YouTube set (none on a plain video)', !keys2.includes('nexttrack'), keys2.join(','));
  // YouTube sometimes registers a real next handler (seen in playlists); it must still run.
  // Marionette's default sandbox sees the page's own objects, so this goes through Cue's wrapper as YouTube's call does.
  await ff.eval(`navigator.mediaSession.setActionHandler('nexttrack', () => { document.documentElement.dataset.youtubeNext = 'called'; })`);
  const keys3 = await media();
  check('YouTube’s own next handler is in place', keys3.includes('nexttrack'), keys3.join(','));
  await media('nextTrack');
  check('media next falls back to YouTube’s handler', await until(() => ff.eval(`return document.documentElement.dataset.youtubeNext === 'called'`), 5000));
  check('the queue did not move', (await current()) === V2 && (await playing()) === V2);
  await ff.command({ type: 'queue/add', videoIds: [VIDEOS[3]] });
  await attrsAre('queueing a video marks next again', { next: '1' });
  await ff.eval(`delete document.documentElement.dataset.youtubeNext`);
  const handled = await media('nextTrack').then(() => sleep(300)).then(() => ff.eval(`return document.documentElement.dataset.youtubeNext ?? 'not called'`));
  await waitFor('…and media next takes over again: plays it', async () => (await playing()) === VIDEOS[3] && (await current()) === VIDEOS[3], playing);
  check('YouTube’s handler was not called that time', handled === 'not called', handled);
  await playable();
  await attrsAre('at the end again, next is not marked (previous is)', { next: null, previous: '1' });
  await sleep(3000); // let YouTube's own up-next load
  const reached = await shiftN();
  check('with nothing next, Shift+N gets past Cue untouched', reached === 'reached' || reached === 'navigated', reached);
  await waitFor('Shift+N falls back to YouTube (its next video)', async () => {
    const v = await playing();
    return v && !VIDEOS.slice(0, 4).includes(v);
  }, playing);
  check('the queue did not move', (await current()) === VIDEOS[3]);

  // ── Other YouTube tabs keep YouTube's behaviour ──
  await ff.newTab();
  await ff.goto(watch(V0));
  await sleep(3000);
  await attrsAre('a non-player YouTube tab is not taken over', { next: null, previous: null, page: '1' });
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
