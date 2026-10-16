// #13 Stop point and ends-at time, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  entryId,
  panel,
  playable,
  playing,
  queueState,
  rowMenu,
  sleep,
  stored,
  summary,
  until,
  video,
  watch,
  withCue,
} from './lib.mjs';

const [V0, SHORT, V2, V3] = VIDEOS;
const ff = await withCue(launch, 'stop-point-firefox');

const stopId = async () => (await queueState(ff)).stopAfterId ?? null;
const marked = () => panel(ff, `return [...root.querySelectorAll('li.row')].filter((r) => r.querySelector('.stop-mark')).map((r) => (r.querySelector('img').src.match(/vi\\/([\\w-]{11})\\//) || [])[1]);`);
const timeLeft = () => panel(ff, `return root.querySelector('.panel-header .time-left')?.textContent ?? null;`);
/** Minutes from now until the "ends 10:42 PM" time in the header. */
const endsInMinutes = async () => {
  const text = await timeLeft();
  const m = /ends (\d{1,2}):(\d{2})\s*([AaPp]\.?[Mm]\.?)?/.exec(text ?? '');
  if (!m) return null;
  let h = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3] && /p/i.test(m[3])) h += 12;
  const now = new Date();
  const end = new Date(now);
  end.setHours(h, Number(m[2]), 0, 0);
  if (end < now - 60_000) end.setDate(end.getDate() + 1);
  return (end - now) / 60_000;
};

try {
  await ff.command({ type: 'queue/add', videoIds: [V0, SHORT, V2] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));
  check('every video length is known', await until(async () => (await queueState(ff)).entries.every((e) => e.durationSec), 30000));

  // ── Ends at ──
  const text = await until(timeLeft, 10000);
  check('the header shows the time left and the end time', /\d+ min left · ends \d{1,2}:\d{2}/.test(text ?? ''), text);
  const q = await queueState(ff);
  const position = (await video(ff)).time;
  const expected = (q.entries.reduce((s, e) => s + e.durationSec, 0) - position) / 60;
  const ends = await endsInMinutes();
  check('…finishing when the rest of the queue has played', ends !== null && Math.abs(ends - expected) <= 1.5, { ends, expected });
  await ff.command({ type: 'queue/add', videoIds: [V3] });
  const later = await until(async () => {
    const e = await endsInMinutes();
    return e !== null && e > ends + 3 && e;
  }, 10000);
  check('adding a video moves the end time later', later, { before: ends, after: later, text: await timeLeft() });

  // ── Setting, replacing and clearing the Stop point ──
  check('Stop after this is in a video’s ⋮ menu', await rowMenu(ff, V2, 'Stop after this'));
  check('…and sets the Stop point', await until(async () => (await stopId()) === (await entryId(ff, V2)), 5000));
  check('the row says "Stops after this"', JSON.stringify(await until(marked, 3000)) === JSON.stringify([V2]), await marked());
  check('setting another moves the Stop point there', (await rowMenu(ff, V0, 'Stop after this')) && (await until(async () => (await stopId()) === (await entryId(ff, V0)), 5000)));
  check('…so only one row is marked', JSON.stringify(await marked()) === JSON.stringify([V0]), await marked());
  check('its menu offers to clear it', await rowMenu(ff, V0, "Don't stop after this"));
  check('…which clears it', await until(async () => (await stopId()) === null, 5000));

  await rowMenu(ff, V2, 'Stop after this');
  await until(async () => (await stopId()) !== null, 5000);
  await rowMenu(ff, V2, 'Remove from queue');
  check('removing the Stop point entry clears it', await until(async () => (await stopId()) === null, 5000));
  await clickPanelButton(ff, 'Undo');
  check('…and Undo brings it back, marked', await until(async () => (await stopId()) === (await entryId(ff, V2)), 5000) && JSON.stringify(await marked()) === JSON.stringify([V2]));

  // ── Pausing at the Stop point ──
  await rowMenu(ff, V0, 'Stop after this');
  await until(async () => (await stopId()) === (await entryId(ff, V0)), 5000);
  await video(ff, 'v.currentTime = v.duration - 5; v.play(); return true');
  const paused = await until(() => video(ff, 'return v.paused && v.duration - v.currentTime < 1.5 && { time: v.currentTime, duration: v.duration }'), 20000);
  check('playback pauses as the Stop point video ends', paused, paused);
  await sleep(10000); // long enough for YouTube's own autoplay countdown
  check('…and no next video loads', (await playing(ff)) === V0 && (await currentVideo(ff)) === V0, await ff.url());
  check('…the player stays paused', await video(ff, 'return v.paused'));
  check('the Stop point clears itself', (await stopId()) === null && (await marked()).length === 0);
  check('the video counts as Watched', ((await stored(ff, 'progress')) ?? {})[V0]?.watched === true);

  await ff.command({ type: 'play/next' });
  check('next still plays the following entry afterwards', await until(async () => (await playing(ff)) === SHORT && (await currentVideo(ff)) === SHORT, 20000));
  await playable(ff);
  await video(ff, 'v.currentTime = v.duration - 2; v.play(); return true');
  check('without a Stop point the queue moves on at the end as before', await until(async () => (await currentVideo(ff)) === V2, 20000), await currentVideo(ff));
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
