// #5 Alt+click to queue, plus the empty-Queue hint, in headless Firefox over Marionette.
import { launch } from './ff.mjs';
import { VIDEOS, check, sleep, summary, until, watch } from './lib.mjs';

const [V0] = VIDEOS;
const ALT = '';
const SHIFT = '';
const HINT = 'Middle-click or Alt+click any video to queue it.';
const ff = await launch('alt-firefox');

/** Tags a visible, not-yet-queued video link (a thumbnail or a title) and returns where to click. */
async function pick(kind, skip, root = 'body') {
  await until(() => ff.eval(`return document.querySelectorAll('${root} a[href*="/watch?v="]').length > 3`), 30000);
  return ff.eval(
    `const [kind, skip, root] = arguments;
     document.querySelectorAll('[data-cue-test]').forEach((el) => delete el.dataset.cueTest);
     const v = (a) => new URL(a.href).searchParams.get('v');
     const isThumb = (a) => a.querySelector('img, yt-image, yt-thumbnail-view-model');
     const a = [...document.querySelectorAll(root + ' a[href*="/watch?v="]')].find((a) => {
       const r = a.getBoundingClientRect();
       return r.width > 20 && r.height > 10 && !skip.includes(v(a)) && !a.closest('#queuetube-host') && (kind === 'thumb' ? isThumb(a) : !isThumb(a) && a.textContent.trim().length > 3);
     });
     if (!a) return null;
     a.dataset.cueTest = '1';
     a.scrollIntoView({ block: 'center' });
     const r = a.getBoundingClientRect();
     return { v: v(a), x: r.x + Math.min(20, r.width / 2), y: r.y + r.height / 2, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };`,
    [kind, skip, root]
  );
}

async function altClick(label, link, { shift = false, expectAt = 'end' } = {}) {
  if (!link) return check(`${label}: found a video link`, false);
  const url = await ff.url();
  await ff.pointer(link.x, link.y, { keys: shift ? [ALT, SHIFT] : [ALT] });
  await sleep(400);
  const badge = await ff.eval(`for (const el of document.body.children) {
      const span = el.shadowRoot?.querySelector('span[role="status"]');
      if (span) { const r = el.getBoundingClientRect(); const l = document.querySelector('[data-cue-test]').getBoundingClientRect();
        return { text: span.textContent, dx: Math.round(r.x + r.width / 2 - (l.x + l.width / 2)), dy: Math.round(r.y + r.height / 2 - (l.y + l.height / 2)) }; }
    } return null;`);
  const ok = await until(async () => (await ff.queueIds()).includes(link.v), 6000);
  const after = await ff.queueIds();
  check(`${label}: queues the video`, ok, link.v);
  if (expectAt === 'end') check(`${label}: at the end`, after.at(-1) === link.v, after.join());
  else check(`${label}: right after the current entry`, after.indexOf(link.v) === expectAt, after.join());
  await sleep(300);
  check(`${label}: did not navigate`, (await ff.url()) === url, await ff.url());
  check(`${label}: shows a confirmation on the link`, badge && /^Queued/.test(badge.text) && Math.abs(badge.dx) < 2 && Math.abs(badge.dy) < 2, JSON.stringify(badge));
}

try {
  await ff.setCookies();
  await ff.install();
  await sleep(2000);
  const base = await ff.extBase();

  // ── Empty-queue hints ──
  await ff.goto(watch(V0));
  const player = await ff.current();
  check('panel shows the hint', await until(() => ff.eval(`return document.querySelector('#queuetube-host')?.shadowRoot?.querySelector('.empty-text')?.textContent === arguments[0]`, [HINT]), 30000));
  await ff.newTab();
  await ff.goto(`${base}/src/popup/index.html`);
  check('popup shows the hint', await until(() => ff.eval(`return document.body.innerText.includes(arguments[0])`, [HINT]), 5000));
  await ff.closeTab();

  // ── Search results, in a second YouTube tab ──
  await ff.switchTo(player);
  await ff.newTab();
  await ff.goto('https://www.youtube.com/results?search_query=lofi+hip+hop');
  await sleep(2500);
  await altClick('search thumbnail', await pick('thumb', await ff.queueIds()));
  await altClick('search title', await pick('title', await ff.queueIds()));

  // ── Channel videos page ──
  await ff.goto('https://www.youtube.com/@YouTube/videos');
  await sleep(2500);
  await altClick('channel thumbnail', await pick('thumb', await ff.queueIds()));

  // ── Watch-page suggestions in the player tab ──
  await ff.command({ type: 'queue/add', videoIds: [V0], at: 0 });
  await ff.switchTo(player);
  await ff.goto(watch(V0)); // the panel's current entry is V0 now
  await until(async () => (await ff.ext(`return (await browser.storage.local.get('queue')).queue.currentId`)) !== null, 10000);
  await sleep(2000);
  const currentIdx = (await ff.queueIds()).indexOf(V0);
  await altClick('player suggestion, Alt+Shift (Play next)', await pick('thumb', await ff.queueIds(), '#secondary'), { shift: true, expectAt: currentIdx + 1 });
  await altClick('player suggestion title, Alt', await pick('title', await ff.queueIds(), '#secondary'));
  check('player still on V0', new URL(await ff.url()).searchParams.get('v') === V0);

  // ── A plain click still navigates ──
  const plain = await pick('title', await ff.queueIds(), '#secondary');
  await ff.pointer(plain.x, plain.y);
  check('a plain click still opens the video', await until(async () => new URL(await ff.url()).searchParams.get('v') === plain.v, 10000), await ff.url());
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
