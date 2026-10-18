// #10 Progress bars on Queue and History rows, in headless Firefox over Marionette on real YouTube.
import { launch } from './ff.mjs';
import {
  VIDEOS,
  check,
  clickPanelButton,
  currentVideo,
  panel,
  playable,
  screenshot,
  seekAndPause,
  setTheme,
  sleep,
  summary,
  until,
  video,
  watch,
  withCue,
} from './lib.mjs';

const [V0, V1, V2] = VIDEOS;
const ff = await withCue(launch, 'progress-bars-firefox');

/** The bar on a row, by video id: its percentage and colours, or null when it has none. */
const bar = (videoId) =>
  panel(ff, `const row = [...root.querySelectorAll('li.row')].find((r) => r.querySelector('img')?.src.includes('/vi/${videoId}/'));
    const el = row?.querySelector('.thumb .progress');
    if (!el) return row ? 'none' : null;
    const fill = el.firstElementChild, s = getComputedStyle(fill), track = getComputedStyle(el);
    return { percent: Number(el.dataset.percent), width: fill.getBoundingClientRect().width / el.getBoundingClientRect().width,
             height: el.getBoundingClientRect().height, fill: s.backgroundColor, track: track.backgroundColor };`);

try {
  await ff.command({ type: 'queue/add', videoIds: [V0, V1, V2] });
  await ff.goto(watch(V0));
  await until(async () => (await currentVideo(ff)) === V0, 20000);
  check('the first video plays', await playable(ff));
  await until(() => panel(ff, `return root.querySelectorAll('li.row').length === 3`), 15000);

  check('rows without Watch progress have no bar', (await bar(V1)) === 'none' && (await bar(V2)) === 'none');

  await seekAndPause(ff, 106);
  const half = await until(async () => {
    const b = await bar(V0);
    return b?.percent >= 45 && b;
  }, 8000);
  check('the playing row shows a bar for its Watch progress (1:46 of 3:32 ≈ 50%)', half && half.percent >= 48 && half.percent <= 52, half);
  check('…drawn at that width', half && Math.abs(half.width - half.percent / 100) < 0.03, half?.width);
  check('…as a thin red bar', half && half.height >= 2 && half.height <= 5 && /rgb\(255, 0, 51\)/.test(half.fill), half);

  // ── Updates while playing, without the list re-rendering ──
  await panel(ff, `window.__cueOther = 0; window.__cueBar = 0;
    new MutationObserver((list) => { for (const m of list) { const inBar = (m.target.closest?.('.progress, .time-left') ?? m.target.parentElement?.closest('.progress, .time-left')); if (inBar) window.__cueBar++; else window.__cueOther++; } })
      .observe(root, { subtree: true, childList: true, attributes: true, characterData: true }); return true;`);
  await video(ff, 'v.play(); return true');
  const moved = await until(async () => (await bar(V0))?.percent > half.percent + 2, 30000, 1000);
  check('the bar moves while the video plays', moved, await bar(V0));
  check('…changing only the bar', (await ff.eval('return window.__cueBar')) > 0 && (await ff.eval('return window.__cueOther')) === 0, `bar ${await ff.eval('return window.__cueBar')}, other ${await ff.eval('return window.__cueOther')}`);

  // ── Light and dark ──
  await setTheme(ff, 'dark');
  const dark = await bar(V0);
  console.log('  screenshot:', await screenshot(ff, 'progress-bars-dark'));
  check('light theme applies', await setTheme(ff, 'light'));
  const light = await bar(V0);
  console.log('  screenshot:', await screenshot(ff, 'progress-bars-light'));
  check('the bar is the same YouTube red in light and dark', dark && light && dark.fill === light.fill && dark.track === light.track, { dark, light });
  check('the length badge sits above the bar', await panel(ff, `const t = root.querySelector('li.row .thumb:has(.progress)'); const d = t?.querySelector('.duration'), p = t?.querySelector('.progress'); return !d || d.getBoundingClientRect().bottom <= p.getBoundingClientRect().top + 0.5;`));
  await setTheme(ff, 'dark');

  // ── Watched: a full bar, in the Queue and in History ──
  await seekAndPause(ff, 205);
  const full = await until(async () => (await bar(V0))?.percent === 100 && (await bar(V0)), 8000);
  check('a Watched video shows a full bar', full?.percent === 100 && full.width > 0.99, full);
  await ff.command({ type: 'play/next' });
  await until(async () => (await currentVideo(ff)) === V1, 20000);
  await clickPanelButton(ff, 'History');
  await sleep(500);
  const history = await until(async () => (await bar(V0))?.percent === 100 && (await bar(V0)), 5000);
  check('History rows show the bar too (full for the Watched video)', history?.percent === 100, history);
  console.log('  screenshot:', await screenshot(ff, 'progress-bars-history'));
  await clickPanelButton(ff, 'Queue');
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
