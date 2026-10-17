// #18 Shelf, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  entryId,
  openFresh,
  panel,
  panelRows,
  playable,
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

const [V0, V1, V2, V3, V4] = VIDEOS;
const NAME = 'shelf-firefox';
let ff = await withCue(launch, NAME);

const queued = async () => (await queueState(ff)).entries.map((e) => e.videoId);
const shelved = async () => ((await stored(ff, 'shelf')) ?? []).map((s) => s.videoId);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const chip = (label) => panel(ff, `return [...root.querySelectorAll('.chips .chip')].find((c) => c.textContent.startsWith(${JSON.stringify(label)}))?.textContent ?? null;`);
const openTab = (label) => panel(ff, `const c = [...root.querySelectorAll('.chips .chip')].find((c) => c.textContent.startsWith(${JSON.stringify(label)})); c?.click(); return Boolean(c);`);

/** Drags a row (by video id) onto a tab chip, with the events and data a real drag carries. */
const dragToTab = (videoId, label) =>
  panel(ff, `const row = [...root.querySelectorAll('li.row')].find((r) => r.querySelector('img').src.includes('/vi/${videoId}/'));
    const tab = [...root.querySelectorAll('.chips .chip')].find((c) => c.textContent.startsWith(${JSON.stringify(label)}));
    if (!row || !tab) return false;
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
    fire(row, 'dragstart');
    fire(tab, 'dragenter');
    const accepted = !fire(tab, 'dragover');
    if (accepted) fire(tab, 'drop');
    fire(row, 'dragend');
    return accepted;`);

try {
  // 1.4 left no shelf key.
  await ff.ext(`await browser.storage.local.remove('shelf'); return true;`);
  await ff.command({ type: 'queue/add', videoIds: [V0, V1, V2, V3, V4] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));
  check('the panel has Queue · Shelf · History tabs', await until(async () => (await chip('Queue')) && (await chip('Shelf')) && (await chip('History')), 10000));
  await openTab('Shelf');
  check('with 1.4 data the Shelf is empty and says how to use it', await until(() => panel(ff, `return /Nothing on the shelf/.test(root.querySelector('.empty-title')?.textContent ?? '')`), 3000));
  await openTab('Queue');

  // ── Move to shelf ──
  check('Move to shelf is in a video’s ⋮ menu', await rowMenu(ff, V2, 'Move to shelf'));
  check('…taking it out of the queue and onto the Shelf', await until(async () => !(await queued()).includes(V2) && same(await shelved(), [V2]), 5000), { queue: await queued(), shelf: await shelved() });
  check('the Shelf tab counts it', (await chip('Shelf')) === 'Shelf 1', await chip('Shelf'));
  await openTab('Shelf');
  check('the Shelf tab lists it', await until(async () => same(await panelRows(ff), [V2]), 3000), await panelRows(ff));

  // ── Back to queue ──
  check('Back to queue is in a shelved video’s ⋮ menu', await rowMenu(ff, V2, 'Back to queue'));
  check('…putting it at the end of the queue and off the Shelf', await until(async () => (await queued()).at(-1) === V2 && (await shelved()).length === 0, 5000), { queue: await queued(), shelf: await shelved() });
  await openTab('Queue');
  await rowMenu(ff, V4, 'Move to shelf');
  await until(async () => same(await shelved(), [V4]), 5000);
  await openTab('Shelf');
  check('Play next is in a shelved video’s ⋮ menu', await rowMenu(ff, V4, 'Play next'));
  check('…putting it right after the current entry', await until(async () => (await queued())[1] === V4 && (await shelved()).length === 0, 5000), await queued());

  // ── Nothing on the Shelf plays by itself ──
  await openTab('Queue');
  await rowMenu(ff, V4, 'Move to shelf');
  await until(async () => same(await shelved(), [V4]), 5000);
  const next = (await queueState(ff)).entries[1].videoId;
  await ff.command({ type: 'play/next' });
  check('next passes over a video moved to the Shelf', await until(async () => (await currentVideo(ff)) === next, 20000), { now: await currentVideo(ff), expected: next });
  await playable(ff);
  // The next entry can be the 19-second video: pause it so it doesn't end and reload the page mid-check.
  await video(ff, 'v.pause(); return true');
  await until(() => panel(ff, `return root.querySelectorAll('li.row').length > 0`), 10000);

  // ── Reorder and remove on the Shelf ──
  for (const v of [V1, V3]) await rowMenu(ff, v, 'Move to shelf');
  await until(async () => (await shelved()).length === 3, 5000);
  await openTab('Shelf');
  const order = await shelved();
  check('Move to top reorders the Shelf', (await rowMenu(ff, order[2], 'Move to top')) && (await until(async () => same(await shelved(), [order[2], order[0], order[1]]), 5000)), await shelved());
  await panel(ff, `root.querySelectorAll('li.row')[1].focus(); return true;`);
  await ff.keys(['', '']); // Alt+ArrowUp
  check('Alt+↑ reorders the Shelf from the keyboard', await until(async () => same(await shelved(), [order[0], order[2], order[1]]), 5000), await shelved());
  check('Remove from shelf removes it', (await rowMenu(ff, order[1], 'Remove from shelf')) && (await until(async () => !(await shelved()).includes(order[1]), 5000)));
  check('…from both places', !(await queued()).includes(order[1]));

  // ── Queueing a shelved video by any route takes it off the Shelf ──
  const [first, second] = await shelved();
  await ff.command({ type: 'queue/add', videoIds: [first] }); // as right-click, Alt+click, drop and Import do
  check('queueing a shelved video takes it off the Shelf', await until(async () => !(await shelved()).includes(first) && (await queued()).includes(first), 5000));
  check('Auto-queue of a shelved video (fresh tab)', await openFresh(ff, watch(second), player));
  check('…takes it off the Shelf too', await until(async () => !(await shelved()).includes(second) && (await queued()).includes(second), 10000), { shelf: await shelved(), queue: await queued() });

  // ── Dragging between the tabs ──
  await openTab('Queue');
  await sleep(300);
  const dragged = (await queued()).at(-1);
  check('a queue row dragged onto the Shelf tab is accepted', await dragToTab(dragged, 'Shelf'));
  check('…and moves to the Shelf', await until(async () => same(await shelved(), [dragged]) && !(await queued()).includes(dragged), 5000), { shelf: await shelved() });
  await openTab('Shelf');
  await sleep(300);
  check('a shelved video dragged onto the Queue tab is accepted', await dragToTab(dragged, 'Queue'));
  check('…and goes back to the end of the queue', await until(async () => (await shelved()).length === 0 && (await queued()).at(-1) === dragged, 5000), await queued());
  check('the History tab takes no drops', !(await (async () => { await openTab('Queue'); await sleep(300); return dragToTab(V0, 'History'); })()));

  // ── Survives a restart ──
  await rowMenu(ff, dragged, 'Move to shelf');
  await until(async () => same(await shelved(), [dragged]), 5000);
  await ff.quit();
  ff = await launch(NAME, { keepProfile: true });
  ff.extInWindow = true;
  await ff.install();
  await sleep(2500);
  check('the Shelf survives a browser restart', same(await shelved(), [dragged]), await shelved());
  check('…and is still not in the queue', !(await queued()).includes(dragged));
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
