// #7 check: what YouTube registers, and which page-context techniques work, in a given Firefox.
import path from 'path';
import { launch } from './ff.mjs';
import { ROOT, sleep, until } from './lib.mjs';

const exe = process.argv[2];
const ff = await launch('probe-world-' + (exe ? 'old' : 'new'), exe ? { executablePath: exe } : {});
try {
  console.log('version', await ff.chrome(`return Services.appinfo.version`));
  await ff.setCookies();
  console.log('install', await ff.install(path.join(ROOT, 'probe-ext')));
  console.log('grant', await ff.grantHosts('probe@cue.test', ['*://www.youtube.com/*']));
  await sleep(1000);
  for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ']) {
  await ff.goto(url);
  await until(() => ff.eval(`return document.querySelector('video')?.currentTime > 1`), 30000);
  await sleep(3000);
  console.log('---', url, 'autoplay toggle:', await ff.eval(`return document.querySelector('.ytp-autonav-toggle-button')?.getAttribute('aria-checked')`));
  console.log('track handlers:', (await ff.eval(`return document.documentElement.getAttribute('data-probe-log')`) || '').split(';').filter((s) => /track/.test(s)).join(' '));
  console.log('keydown listeners:', [...new Set((await ff.eval(`return document.documentElement.getAttribute('data-probe-log')`) || '').split(';').filter((s) => /^key/.test(s)))].join(' '));
  await ff.eval(`document.documentElement.setAttribute('data-probe-log', '')`);
  }
  const attrs = await ff.eval(`return Object.fromEntries([...document.documentElement.attributes].filter(a => a.name.startsWith('data-probe')).map(a => [a.name, a.value]))`);
  for (const [k, v] of Object.entries(attrs)) if (!/log/.test(k)) console.log(k.padEnd(30), v.slice(0, 300));
  // Which YouTube hotkey handler: does a keydown listener on document react to Shift+N?
  const n = await ff.eval(`return document.querySelector('video').src`);
  console.log('video src set', Boolean(n));
} catch (e) { console.error(e); }
await ff.quit();
