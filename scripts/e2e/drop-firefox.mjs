// #6 Drop a video onto the queue panel, in headless Firefox over Marionette with real pointer drags.
import { launch } from './ff.mjs';
import { VIDEOS, check, sleep, summary, until, watch } from './lib.mjs';

const [V0, V1, V2] = VIDEOS;
const ff = await launch('drop-firefox');
const ROWS = `document.querySelector('#queuetube-host').shadowRoot.querySelectorAll('li.row')`;

async function rect(js) {
  return ff.eval(`const el = ${js}; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };`);
}

/** A not-yet-queued suggestion thumbnail. */
async function suggestion() {
  const skip = await ff.queueIds();
  return ff.eval(`const skip = arguments[0];
    const a = [...document.querySelectorAll('#secondary a[href*="/watch?v="]')].find((a) => a.querySelector('img, yt-image, yt-thumbnail-view-model') && a.getBoundingClientRect().height > 30 && !skip.includes(new URL(a.href).searchParams.get('v')));
    document.querySelectorAll('[data-cue-test]').forEach((el) => delete el.dataset.cueTest);
    a.dataset.cueTest = '1';
    return new URL(a.href).searchParams.get('v');`, [skip]);
}

/**
 * Marionette's pointer actions don't start a native drag session, so this dispatches the drag
 * events with the data Firefox gives a dragged link (or a dragged panel row, for reordering).
 */
async function drag(fromJs, toJs, fraction) {
  await rect(toJs);
  const marks = await ff.eval(`const [fraction] = arguments;
    const from = ${fromJs};
    const to = ${toJs};
    const r = to.getBoundingClientRect();
    const at = { bubbles: true, composed: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height * fraction };
    const data = new DataTransfer();
    if (from instanceof HTMLAnchorElement) {
      data.setData('text/x-moz-url', from.href + String.fromCharCode(10) + from.textContent.trim());
      data.setData('text/uri-list', from.href);
      data.setData('text/plain', from.href);
    }
    // A panel row fills its own data in its dragstart handler.
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: data }));
    to.dispatchEvent(new DragEvent('dragenter', { ...at, dataTransfer: data }));
    to.dispatchEvent(new DragEvent('dragover', { ...at, dataTransfer: data }));
    window.__cueDrag = { to, at, data, from };
    return new Promise((done) => requestAnimationFrame(() => done(
      [...${ROWS}].map((r, i) => r.classList.contains('drop-before') ? i + ':before' : r.classList.contains('drop-after') ? i + ':after' : null).filter(Boolean))));`, [fraction]);
  await ff.eval(`const { to, at, data, from } = window.__cueDrag;
    const dropped = !to.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer: data }));
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, composed: true, dataTransfer: data }));
    return dropped;`);
  await sleep(600);
  return marks;
}

try {
  await ff.setCookies();
  await ff.install();
  await sleep(2000);
  await ff.command({ type: 'queue/add', videoIds: [V0, V1, V2] });
  await ff.goto(watch(V0));
  await until(() => ff.eval(`return ${ROWS}.length === 3`), 30000);
  await sleep(2000);

  let v = await suggestion();
  let marks = await drag(`document.querySelector('[data-cue-test]')`, `${ROWS}[1]`, 0.25);
  check('indicator shows before row 1 while dragging', marks.join() === '1:before', marks.join());
  check('dropped video is inserted at that position', await until(async () => (await ff.queueIds()).join() === [V0, v, V1, V2].join()), (await ff.queueIds()).join());
  check('the player did not navigate', new URL(await ff.url()).searchParams.get('v') === V0, await ff.url());

  v = await suggestion();
  marks = await drag(`document.querySelector('[data-cue-test]')`, `${ROWS}[3]`, 0.75);
  check('indicator shows after the last row', marks.join() === '3:after', marks.join());
  check('dropped at the end', await until(async () => (await ff.queueIds()).at(-1) === v), (await ff.queueIds()).join());

  const before = await ff.queueIds();
  marks = await drag(`${ROWS}[4]`, `${ROWS}[1]`, 0.25);
  check('reordering shows the same indicator', marks.join() === '1:before', marks.join());
  check('reordering still works', await until(async () => (await ff.queueIds()).join() === [before[0], before[4], before[1], before[2], before[3]].join()), (await ff.queueIds()).join());

  const now = (await ff.queueIds()).join();
  await drag(`document.querySelector('ytd-video-owner-renderer a[href^="/@"], #secondary a[href^="/@"]')`, `${ROWS}[1]`, 0.25);
  await sleep(500);
  check('dropping a channel link adds nothing', (await ff.queueIds()).join() === now, (await ff.queueIds()).join());
  check('…and does not navigate', new URL(await ff.url()).searchParams.get('v') === V0, await ff.url());
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
