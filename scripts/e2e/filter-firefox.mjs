// #15 Filter the Queue, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  panel,
  panelRows,
  playable,
  queueState,
  rowMenu,
  sleep,
  summary,
  until,
  video,
  watch,
  withCue,
} from './lib.mjs';

const [V0] = VIDEOS;
const ff = await withCue(launch, 'filter-firefox');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const focusFilter = () => panel(ff, `const i = root.querySelector('.filter input'); i?.focus(); return root.activeElement === i;`);
const filterValue = () => panel(ff, `return root.querySelector('.filter input')?.value ?? null;`);
const clearBox = async () => {
  await focusFilter();
  await panel(ff, `const i = root.querySelector('.filter input'); i.select(); return true;`);
  await ff.keys(['']); // Backspace
  await sleep(200);
};
/** Which queued videos should show for `text`, by the rule the ticket gives: title or channel, ignoring case. */
const expectedFor = async (text) =>
  (await queueState(ff)).entries.filter((e) => `${e.title}\n${e.channel}`.toLowerCase().includes(text.toLowerCase())).map((e) => e.videoId);

try {
  await ff.command({ type: 'queue/add', videoIds: VIDEOS });
  await ff.goto(watch(V0));
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));
  check('every title and channel is known', await until(async () => (await queueState(ff)).entries.every((e) => e.title && e.channel), 30000));
  check('a filter box shows above the queue', await until(() => panel(ff, `return Boolean(root.querySelector('.filter input'))`), 5000));
  check('rows can be dragged before filtering', await panel(ff, `return [...root.querySelectorAll('li.row')].every((r) => r.draggable)`));

  // ── By channel, ignoring case ──
  const entries = (await queueState(ff)).entries;
  const channel = entries[3].channel;
  const byChannel = channel.slice(0, Math.max(3, Math.ceil(channel.length / 2))).toUpperCase();
  await focusFilter();
  await ff.typeText(byChannel);
  const wantChannel = await expectedFor(byChannel);
  check(`typing part of a channel (“${byChannel}”) shows only its videos`, await until(async () => same(await panelRows(ff), wantChannel), 3000), { shown: await panelRows(ff), want: wantChannel });
  check('drag-to-reorder is off while filtering', await panel(ff, `return [...root.querySelectorAll('li.row')].every((r) => !r.draggable)`));
  check('…and so are Move to top and Move to bottom', !(await rowMenu(ff, wantChannel[0], 'Move to top')) && !(await rowMenu(ff, wantChannel[0], 'Move to bottom')));

  // ── By title ──
  await clearBox();
  const word = entries[5].title.split(/\s+/).find((w) => w.length >= 4) ?? entries[5].title.slice(0, 4);
  await focusFilter();
  await ff.typeText(word.toLowerCase());
  const wantTitle = await expectedFor(word);
  check(`typing a word of a title (“${word.toLowerCase()}”) shows only matching videos`, await until(async () => same(await panelRows(ff), wantTitle), 3000), { shown: await panelRows(ff), want: wantTitle });
  await focusFilter();
  await ff.typeText('zzqx');
  check('no match says so', await until(() => panel(ff, `return /No videos match/.test(root.querySelector('.filter-empty')?.textContent ?? '')`), 3000));

  // ── YouTube's own shortcuts stay out of the box ──
  await clearBox();
  const wasPlaying = !(await video(ff)).paused;
  await focusFilter();
  await ff.typeText('k');
  await sleep(500);
  check('typing "k" in the filter does not pause the video (YouTube’s shortcut)', wasPlaying && !(await video(ff)).paused, await video(ff));
  check('…it goes into the box', (await filterValue()) === 'k');

  // ── Esc clears ──
  await focusFilter();
  await ff.keys(['']); // Escape
  check('Esc clears the filter', await until(async () => (await filterValue()) === '', 3000), await filterValue());
  check('…and every row shows again, draggable', await until(() => panel(ff, `const rows = [...root.querySelectorAll('li.row')]; return rows.length === 6 && rows.every((r) => r.draggable)`), 3000));

  // ── Row actions on filtered rows ──
  const target = entries[4];
  await focusFilter();
  await ff.typeText(target.title.slice(0, 12));
  await until(async () => (await panelRows(ff)).includes(target.videoId), 3000);
  check('Play next works on a filtered row', await rowMenu(ff, target.videoId, 'Play next'));
  check('…moving it right after the current entry', await until(async () => (await queueState(ff)).entries[1]?.videoId === target.videoId, 5000), (await queueState(ff)).entries.map((e) => e.videoId));
  check('clicking a filtered row plays it', await panel(ff, `const row = [...root.querySelectorAll('li.row')].find((r) => r.querySelector('img').src.includes('/vi/${target.videoId}/')); row?.click(); return Boolean(row);`));
  check('…as the current entry', await until(async () => (await currentVideo(ff)) === target.videoId && new URL(await ff.url()).searchParams.get('v') === target.videoId, 20000));
  await playable(ff);
  const other = entries[2];
  await clearBox();
  await focusFilter();
  await ff.typeText(other.title.slice(0, 12));
  await until(async () => (await panelRows(ff)).includes(other.videoId), 3000);
  check('Remove works on a filtered row', await rowMenu(ff, other.videoId, 'Remove from queue'));
  check('…removing it from the queue', await until(async () => !(await queueState(ff)).entries.some((e) => e.videoId === other.videoId), 5000));
  await clickPanelButton(ff, 'Undo');
  check('…and Undo brings it back', await until(async () => (await queueState(ff)).entries.some((e) => e.videoId === other.videoId), 5000));
  check('the filter is still applied after those actions', (await filterValue()) !== '');
  await clickPanelButton(ff, 'Clear filter');
  check('the clear button empties the filter', await until(async () => (await filterValue()) === '' && (await panelRows(ff)).length === 6, 3000));
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
