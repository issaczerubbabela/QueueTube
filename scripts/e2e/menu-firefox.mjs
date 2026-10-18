// #4 Right-click menu in headless Firefox, through Firefox's real context menu (Marionette).
import { contextMenu, launch } from './ff.mjs';
import { VIDEOS, check, serve, sleep, summary, until, watch } from './lib.mjs';

const [V0, V1, V2, V3, V4, V5] = VIDEOS;
const PAGE = `<!doctype html><body style="font:18px sans-serif;padding:30px;line-height:2">
  <p><a id="watch" href="https://www.youtube.com/watch?v=${V2}&t=10s">watch link</a></p>
  <p><a id="short" href="https://www.youtube.com/shorts/${V3}">shorts link</a></p>
  <p><a id="youtube-be" href="https://youtu.be/${V4}?si=abc">youtu.be link</a></p>
  <p><a id="mobile" href="https://m.youtube.com/watch?v=${V5}">m.youtube link</a></p>
  <p><a id="channel" href="https://www.youtube.com/@YouTube">channel link</a></p>
  <p><a id="music" href="https://music.youtube.com/watch?v=${V2}">YouTube Music link</a></p>
  <p><a id="other" href="https://example.com/">other link</a></p>
  <p id="sel">Selected: <a href="https://youtu.be/${V5}">a link</a> and a mention of https://www.youtube.com/watch?v=${V3} in text.</p>
  <p id="plain">Plain text, nothing to right-click here.</p>
</body>`;
const { server, origin } = await serve({ '/': PAGE });
export const ff = await launch('menu-firefox');

async function menuAt(selector, item = null) {
  const { x, y } = await ff.center(selector);
  return contextMenu(ff, x, y, item);
}
const ids = () => ff.queueIds();

try {
  await ff.setCookies();
  await ff.install();
  await sleep(2000);
  await ff.command({ type: 'queue/add', videoIds: [V0, V1] });
  await ff.goto(watch(V0));
  const player = await ff.current();
  check('panel mounts in the player tab', await until(() => ff.eval(`return document.querySelector('#queuetube-host')?.shadowRoot?.querySelectorAll('li.row').length`), 30000));

  await ff.newTab();
  await ff.goto(origin);
  for (const link of ['watch', 'short', 'youtube-be', 'mobile']) {
    const { labels } = await menuAt(`#${link}`);
    check(`${link}: offers Add to queue and Play next`, labels.join() === 'Cue for YouTube,Add to queue,Play next', labels.join(' | '));
  }
  for (const link of ['channel', 'music', 'other']) {
    const { labels, state } = await menuAt(`#${link}`);
    check(`${link}: no Cue items`, state === 'open' && labels.length === 0, labels.join(' | '));
  }

  await menuAt('#watch', 'Play next');
  check('Play next puts the video right after the current entry', await until(async () => (await ids()).join() === [V0, V2, V1].join()), (await ids()).join());
  await menuAt('#short', 'Add to queue');
  check('Add to queue (shorts) adds to the end', await until(async () => (await ids()).join() === [V0, V2, V1, V3].join()), (await ids()).join());
  await menuAt('#youtube-be', 'Add to queue');
  check('Add to queue (youtu.be) adds to the end', await until(async () => (await ids()).at(-1) === V4), (await ids()).join());
  await menuAt('#watch', 'Add to queue');
  await sleep(800);
  check('an already-queued video is not added again', (await ids()).filter((v) => v === V2).length === 1, (await ids()).join());

  await ff.command({ type: 'queue/clear' });
  const { labels: pageLabels } = await menuAt('#plain');
  check('page context offers Queue all YouTube links here', pageLabels.includes('Queue all YouTube links here'), pageLabels.join(' | '));
  await ff.eval(`const r = document.createRange(); r.selectNodeContents(document.querySelector('#sel')); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  const sel = await menuAt('#sel a', 'Queue all YouTube links here');
  check('selection offers Queue all YouTube links here', sel.clicked, sel.labels.join(' | '));
  check('queues only the selection, links and mentions in order', await until(async () => (await ids()).join() === [V5, V3].join()), (await ids()).join());
  await ff.eval(`getSelection().removeAllRanges()`);
  await ff.command({ type: 'queue/clear' });
  await menuAt('#plain', 'Queue all YouTube links here');
  check('queues every video on a non-YouTube page once, in order', await until(async () => (await ids()).join() === [V2, V3, V4, V5].join()), (await ids()).join());

  // Links on YouTube itself: a suggestion in the player tab.
  await ff.command({ type: 'queue/clear' });
  await ff.switchTo(player);
  const href = await until(() => ff.eval(`return document.querySelector('#secondary a[href*="/watch?v="]')?.href`), 30000);
  const expected = new URL(href).searchParams.get('v');
  const sug = await menuAt('#secondary a[href*="/watch?v="]', 'Add to queue');
  check('a suggestion on YouTube offers the items', sug.labels.join() === 'Cue for YouTube,Add to queue,Play next', sug.labels.join(' | '));
  check('Add to queue on a YouTube suggestion queues it', await until(async () => (await ids()).includes(expected)), `${expected} → ${(await ids()).join()}`);
  check('the player kept playing V0', new URL(await ff.url()).searchParams.get('v') === V0);
} catch (e) {
  check('no errors', false, e.stack);
}
summary();
await ff.quit();
server.close();
