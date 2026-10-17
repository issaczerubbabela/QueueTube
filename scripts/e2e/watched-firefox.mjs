// #11 Skip watched and Clear watched, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  entryId,
  panel,
  panelMenu,
  playable,
  queueState,
  seekAndPause,
  sleep,
  stored,
  summary,
  toast,
  until,
  video,
  watch,
  withCue,
} from './lib.mjs';

const [V0, SHORT, V2, V3] = VIDEOS;
const ff = await withCue(launch, 'watched-firefox');

const isWatched = async (id) => ((await stored(ff, 'progress')) ?? {})[id]?.watched === true;
const jump = async (id) => {
  await ff.command({ type: 'play/entry', entryId: await entryId(ff, id) });
  await until(async () => (await currentVideo(ff)) === id && new URL(await ff.url()).searchParams.get('v') === id, 20000);
  return playable(ff);
};
const snapshot = async () => {
  const q = await queueState(ff);
  return JSON.stringify({ entries: q.entries.map((e) => e.id), currentId: q.currentId });
};

/** Runs `script` on Cue's settings page, in a tab of its own; returns to the player. */
async function onSettings(player, script) {
  await ff.newTab();
  await ff.goto(`${await ff.extBase()}/src/options/index.html`);
  await until(() => ff.eval(`return Boolean(document.querySelector('#guide'))`), 10000);
  const value = await ff.eval(script);
  await ff.closeTab();
  await ff.switchTo(player);
  return value;
}

try {
  await ff.command({ type: 'queue/add', videoIds: [V0, SHORT, V2, V3] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));

  // ── What counts as Watched ──
  await jump(SHORT);
  await video(ff, 'v.currentTime = Math.max(0, v.duration - 1.5); v.play(); return true');
  check('a video that ends is Watched', await until(() => isWatched(SHORT), 90000));
  check('…and the queue moved on to the next entry (Skip watched is off by default)', await until(async () => (await currentVideo(ff)) === V2, 15000));
  await until(async () => new URL(await ff.url()).searchParams.get('v') === V2, 20000);
  await playable(ff);
  await seekAndPause(ff, 230);
  check('a video seen to 90% is Watched', await until(() => isWatched(V2), 8000));
  check('Skip watched is off by default', (await stored(ff, 'settings'))?.skipWatched !== true);

  // ── Off: Advance plays Watched entries ──
  await jump(V0);
  await ff.command({ type: 'play/next' });
  check('with Skip watched off, next plays a Watched entry', await until(async () => (await currentVideo(ff)) === SHORT, 15000), await currentVideo(ff));

  // ── The setting, in settings and linked from the Guide ──
  const found = await onSettings(player, `const row = document.querySelector('#setting-skipWatched');
    const link = [...document.querySelectorAll('#guide a')].find((a) => a.getAttribute('href') === '#setting-skipWatched');
    const box = row?.querySelector('input[type=checkbox]');
    const before = box?.checked;
    box?.click();
    return { row: Boolean(row), label: row?.querySelector('.setting-label')?.textContent, link: Boolean(link), before };`);
  check('Skip watched appears in settings', found.row, found.label);
  check('…and the Guide links to it', found.link);
  check('turning it on from settings saves it', await until(async () => (await stored(ff, 'settings'))?.skipWatched === true, 5000));

  // ── On: Advance passes over Watched entries, both ways ──
  await jump(V0);
  await ff.command({ type: 'play/next' });
  check('with Skip watched on, next passes over the two Watched entries', await until(async () => (await currentVideo(ff)) === V3, 15000), await currentVideo(ff));
  const ids = (await queueState(ff)).entries.map((e) => e.videoId);
  check('…and leaves them in the queue', [V0, SHORT, V2, V3].every((v) => ids.includes(v)), ids);
  await playable(ff);

  await jump(V0);
  await video(ff, 'v.currentTime = v.duration - 2; v.play(); return true');
  check('a video ending passes over Watched entries too', await until(async () => (await currentVideo(ff)) === V3, 90000), await currentVideo(ff));
  check('the next button skips them as well (enabled only with an unwatched entry ahead)', await until(() => panel(ff, `return root.querySelector('button[aria-label="Play next"]')?.disabled === true`), 5000));
  await playable(ff);

  // ── Clear watched, and Undo ──
  const before = await snapshot();
  check('Clear watched is in the ⋮ menu', await panelMenu(ff, 'Clear watched'));
  check('…removes only Watched entries', await until(async () => {
    const q = await queueState(ff);
    return q.entries.length === 1 && q.entries[0].videoId === V3;
  }, 5000), (await queueState(ff)).entries.map((e) => e.videoId));
  check('…and offers Undo', /watched/i.test((await toast(ff)) ?? ''), await toast(ff));
  check('Undo in the message is clickable', await clickPanelButton(ff, 'Undo'));
  check('Undo restores the queue exactly', await until(async () => (await snapshot()) === before, 5000), { before, after: await snapshot() });
  await sleep(500);
  check('the panel shows all four rows again', await panel(ff, `return root.querySelectorAll('li.row').length === 4`));

  await panelMenu(ff, 'Clear watched');
  await until(async () => (await queueState(ff)).entries.length === 1, 5000);
  check('with nothing Watched left, Clear watched is disabled', !(await panelMenu(ff, 'Clear watched')));
  await ff.command({ type: 'queue/undo' });
  check('…and Undo still works after that', await until(async () => (await snapshot()) === before, 5000));
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
