// #14 Sort and shuffle the upcoming Queue, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  panelMenu,
  panelRows,
  playable,
  queueState,
  sleep,
  summary,
  toast,
  until,
  watch,
  withCue,
} from './lib.mjs';

const ff = await withCue(launch, 'sort-firefox');
const [V0] = VIDEOS;

const order = async () => (await queueState(ff)).entries.map((e) => e.videoId);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byLength = (entries, dir) => [...entries].sort((a, b) => (a.durationSec - b.durationSec) * dir).map((e) => e.videoId);
const byChannel = (entries) => [...entries].sort((a, b) => (!a.channel || !b.channel ? (a.channel ? 0 : 1) - (b.channel ? 0 : 1) : a.channel.localeCompare(b.channel, undefined, { sensitivity: 'base' }))).map((e) => e.videoId);

async function rearrange(label, expected, message) {
  const original = await order();
  check(`${label} is in the ⋮ menu`, await panelMenu(ff, label));
  const after = await until(async () => {
    const o = await order();
    return !same(o, original) && o;
  }, 5000);
  check(`${label} puts the videos after the current one in order`, same(after, expected), { after, expected });
  check(`…the panel shows that order`, await until(async () => same(await panelRows(ff), expected), 3000), await panelRows(ff));
  check(`…and says so, with Undo`, (await toast(ff)) === message, await toast(ff));
  await clickPanelButton(ff, 'Undo');
  check(`Undo restores the order before ${label}`, await until(async () => same(await order(), original), 5000), await order());
  await sleep(300);
}

try {
  await ff.command({ type: 'queue/add', videoIds: VIDEOS });
  await ff.goto(watch(V0));
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));
  check('every video length and channel is known', await until(async () => (await queueState(ff)).entries.every((e) => e.durationSec && e.channel), 30000));
  const entries = (await queueState(ff)).entries;
  const rest = entries.slice(1);

  await rearrange('Shortest first', [V0, ...byLength(rest, 1)], 'Sorted shortest first');
  await rearrange('Longest first', [V0, ...byLength(rest, -1)], 'Sorted longest first');
  await rearrange('By channel', [V0, ...byChannel(rest)], 'Sorted by channel');

  // Shuffle: the same videos after the current one, in a new order (retry the 1-in-120 no-change).
  const original = await order();
  let shuffled = original;
  for (let i = 0; i < 3 && same(shuffled, original); i++) {
    await panelMenu(ff, 'Shuffle');
    shuffled = await until(async () => {
      const o = await order();
      return !same(o, original) && o;
    }, 3000) || original;
  }
  check('Shuffle changes the order of the videos after the current one', !same(shuffled, original), shuffled);
  check('…keeping the current one first and the same videos', shuffled[0] === V0 && same([...shuffled].sort(), [...original].sort()));
  check('…and says so', (await toast(ff)) === 'Shuffled', await toast(ff));
  await clickPanelButton(ff, 'Undo');
  check('Undo restores the order before Shuffle', await until(async () => same(await order(), original), 5000));

  // With no current entry, the whole queue is rearranged.
  await ff.command({ type: 'queue/clear' });
  const [, A, B, C] = VIDEOS;
  await ff.command({ type: 'queue/add', videoIds: [C, A, B] });
  // Sorting needs the lengths, which Cue looks up after adding: wait for them so the expected order is fair.
  await until(async () => (await queueState(ff)).entries.filter((e) => e.durationSec).length === 3, 30000);
  check('a queue with no current entry', (await queueState(ff)).currentId === null);
  const all = (await queueState(ff)).entries;
  await panelMenu(ff, 'Shortest first');
  check('Shortest first rearranges the whole queue', await until(async () => same(await order(), byLength(all, 1)), 5000), await order());

  check('with one video to come, sorting is disabled', await (async () => {
    await ff.command({ type: 'queue/clear' });
    await ff.command({ type: 'queue/add', videoIds: [A] });
    await sleep(500);
    return !(await panelMenu(ff, 'Shuffle'));
  })());
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
