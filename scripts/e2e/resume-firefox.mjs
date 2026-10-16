// #9 Watch progress and resume, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  currentVideo,
  entryId,
  openFresh,
  panel,
  playable,
  playing,
  seekAndPause,
  sleep,
  stored,
  summary,
  until,
  video,
  watch,
  withCue,
} from './lib.mjs';

const [V0, SHORT, V2, V3] = VIDEOS;
const NAME = 'resume-firefox';
let ff = await withCue(launch, NAME);

const progress = async (id) => ((await stored(ff, 'progress')) ?? {})[id] ?? null;
const startParam = async () => new URL(await ff.url()).searchParams.get('t');
const waitPlaying = async (label, id) => {
  const ok = await until(async () => (await playing(ff)) === id && (await currentVideo(ff)) === id, 20000);
  check(label, ok, `playing ${await playing(ff)}`);
  return (await playable(ff)) || check(`${id} became playable (no endless ad)`, false);
};

try {
  // ── 1.2 data loads: storage as 1.2 left it (no progress key) ──
  await ff.ext(`await browser.storage.local.remove('progress');
    await browser.storage.local.set({ settings: { autoQueue: true, allowDuplicates: false, removeAfterPlaying: false, focusPlayerAfterQueueing: true, autoAdvance: true, lookUpDurations: true, sidebarCollapsed: false }, lastSeenVersion: '1.2.0' });
    return true;`);
  await ff.command({ type: 'queue/add', videoIds: [V0, SHORT, V2] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await waitPlaying('the first video plays in the player tab', V0);
  check('the panel mounts with 1.2 data', await until(() => panel(ff, `return root.querySelectorAll('li.row').length === 3`), 15000));
  check('no Watch progress yet', (await stored(ff, 'progress')) === null || Object.keys(await stored(ff, 'progress')).length === 0);

  // ── Saving ──
  await seekAndPause(ff, 20);
  await sleep(1500);
  check('under 30 s: nothing saved', (await progress(V0)) === null, await progress(V0));
  await seekAndPause(ff, 75);
  const saved = await until(async () => (await progress(V0))?.position >= 70 && (await progress(V0)), 8000);
  check('pausing at 1:15 saves the position', saved && saved.position >= 70 && saved.position <= 80, saved);
  check('…with the video length', saved && Math.abs(saved.duration - 212) <= 3, saved?.duration);

  // Count changes to the panel while positions are written, except to progress bars (#10) and
  // the time left in the header (#13), which follow the position on purpose.
  await panel(ff, `window.__cueMutations = 0;
    new MutationObserver((list) => { window.__cueMutations += list.filter((m) => !(m.target.closest?.('.progress, .time-left') ?? m.target.parentElement?.closest('.progress, .time-left'))).length; })
      .observe(root, { subtree: true, childList: true, attributes: true, characterData: true }); return true;`);
  await video(ff, 'v.play(); return true');
  const before = (await progress(V0))?.updatedAt ?? 0;
  const ticked = await until(async () => {
    const p = await progress(V0);
    return p && p.updatedAt > before && p.position >= 80;
  }, 25000, 1000);
  check('while playing, the position is saved about every 10 seconds', ticked, await progress(V0));
  check('position writes leave the queue panel alone', (await ff.eval('return window.__cueMutations')) === 0, `${await ff.eval('return window.__cueMutations')} changes`);
  await ff.command({ type: 'queue/add', videoIds: [VIDEOS[5]] });
  check('…while a queue change does reach it (the count works)', await until(() => ff.eval('return window.__cueMutations > 0'), 5000));

  // ── Resume when going back, and when jumping to the entry ──
  await seekAndPause(ff, 100);
  await until(async () => (await progress(V0))?.position >= 95, 8000);
  await ff.command({ type: 'play/next' });
  await waitPlaying('next plays the second entry', SHORT);
  check('the second entry starts from the beginning (no progress)', (await startParam()) === null, await ff.url());
  await ff.command({ type: 'play/previous' });
  await waitPlaying('previous goes back to the first entry', V0);
  check('…loaded with its Watch progress as t=', Number((await startParam())?.replace('s', '')) >= 95, await ff.url());
  const at = await until(async () => {
    const v = await video(ff);
    return v.time >= 95 && v;
  }, 15000);
  check('going back to a partly watched entry resumes it', at && at.time >= 95 && at.time < 130, at);

  // ── Watched: 90% clears the resume point ──
  await seekAndPause(ff, 200);
  const watched = await until(async () => (await progress(V0))?.watched && (await progress(V0)), 8000);
  check('reaching 90% makes the video Watched', watched?.watched === true && watched.position === 0, watched);
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V2) });
  await waitPlaying('jumping to the third entry plays it', V2);
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V0) });
  await waitPlaying('jumping back to the Watched video plays it', V0);
  check('a Watched video starts from the beginning', (await startParam()) === null && (await video(ff)).time < 30, await video(ff));

  // ── t= in an incoming link replaces saved progress ──
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V2) });
  await waitPlaying('the third entry plays again', V2);
  await seekAndPause(ff, 150);
  check('the third entry has progress at 2:30', (await until(async () => (await progress(V2))?.position >= 145, 8000)) !== undefined, await progress(V2));
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V0) });
  await waitPlaying('the first entry plays', V0);
  check('a fresh tab with t=1m30s is Auto-queued (already queued, so not added twice)', await openFresh(ff, watch(V2, '&t=1m30s'), player));
  check('…and its t= replaces the saved progress', (await until(async () => (await progress(V2))?.position === 90, 8000)), await progress(V2));
  check('…without adding a second entry', (await stored(ff, 'queue')).entries.filter((e) => e.videoId === V2).length === 1);
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V2) });
  await waitPlaying('jumping to it plays it', V2);
  const fromLink = await until(async () => {
    const v = await video(ff);
    return v.time >= 88 && v;
  }, 15000);
  check('…from 1:30, as the link asked', fromLink && fromLink.time < 120, fromLink);

  check('a new video from a link with t= is queued with that start', await openFresh(ff, watch(V3, '&t=45'), player));
  check('…saved as its Watch progress', (await until(async () => (await progress(V3))?.position === 45, 8000)), await progress(V3));

  // ── Survives a browser restart ──
  await seekAndPause(ff, 120);
  await until(async () => (await progress(V2))?.position >= 115, 8000);
  const beforeRestart = await stored(ff, 'progress');
  await ff.quit();
  ff = await launch(NAME, { keepProfile: true });
  ff.extInWindow = true;
  await ff.install();
  await sleep(2500);
  const afterRestart = await stored(ff, 'progress');
  check('Watch progress survives a browser restart', afterRestart?.[V2]?.position === beforeRestart[V2].position, afterRestart?.[V2]);
  check('…and so does the queue', (await stored(ff, 'queue'))?.entries.length >= 4);
  await ff.goto(watch(V0));
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  await playable(ff);
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, V2) });
  await waitPlaying('after the restart, the queue still plays', V2);
  const resumed = await until(async () => {
    const v = await video(ff);
    return v.time >= 115 && v;
  }, 15000);
  check('…and resumes where it was before the restart', resumed && resumed.time < 150, resumed);
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
