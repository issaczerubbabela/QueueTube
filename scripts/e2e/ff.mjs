// Firefox over Marionette only (headless, muted). Works on old Firefox versions too, and can reach
// Firefox's own UI (the chrome context), e.g. its context menu.
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { DIST, FIREFOX, ROOT, sleep, until } from './lib.mjs';

const PREFS = {
  'marionette.port': 0,
  'media.volume_scale': '"0.0"',
  // Let videos autoplay with (scaled-to-zero) sound: Firefox only routes media keys to audible media.
  'media.autoplay.default': 0,
  'media.autoplay.blocking_policy': 0,
  'extensions.originControls.grantByDefault': true,
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': '"ignore"',
  'browser.aboutwelcome.enabled': false,
  'startup.homepage_welcome_url': '"about:blank"',
  'startup.homepage_welcome_url.additional': '""',
  'browser.startup.page': 0,
  'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'app.update.disabledForTesting': true,
  'browser.tabs.warnOnClose': false,
  'dom.disable_open_during_load': false,
  'xpinstall.signatures.required': false,
  'extensions.autoDisableScopes': 0,
  'browser.translations.automaticallyPopup': false,
  'layout.css.prefers-color-scheme.content-override': 0,
};

export async function launch(name, { executablePath = FIREFOX, port = 2828 + Math.floor(Math.random() * 1000), prefs = {} } = {}) {
  const profile = path.join(ROOT, 'profiles', name);
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const all = { ...PREFS, ...prefs, 'marionette.port': port };
  fs.writeFileSync(path.join(profile, 'user.js'), Object.entries(all).map(([k, v]) => `user_pref("${k}", ${v});`).join('\n'));
  const proc = spawn(executablePath, ['--headless', '--marionette', '-remote-allow-system-access', '--no-remote', '--profile', profile], { stdio: 'ignore' });
  const client = await connect(port);
  const ff = new Firefox(client, proc, profile);
  await client.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
  await ff.content();
  return ff;
}

async function connect(port) {
  const socket = await until(() => new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => resolve(s));
    s.on('error', () => resolve(null));
  }), 30000, 300);
  if (!socket) throw new Error('Marionette did not start');
  let buffer = Buffer.alloc(0);
  const waiting = new Map();
  let greeted;
  const greeting = new Promise((r) => (greeted = r));
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(':');
      if (colon < 0) return;
      const len = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + len) return;
      const msg = JSON.parse(buffer.subarray(colon + 1, colon + 1 + len).toString('utf8'));
      buffer = buffer.subarray(colon + 1 + len);
      if (!Array.isArray(msg)) greeted(msg);
      else {
        waiting.get(msg[1])?.(msg);
        waiting.delete(msg[1]);
      }
    }
  });
  await greeting;
  let next = 1;
  return {
    socket,
    send: (name, params = {}) =>
      new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, ([, , error, result]) => (error ? reject(new Error(`${name}: ${error.message ?? JSON.stringify(error)}`)) : resolve(result)));
        const body = Buffer.from(JSON.stringify([0, id, name, params]), 'utf8');
        socket.write(Buffer.concat([Buffer.from(`${body.length}:`), body]));
      }),
  };
}

class Firefox {
  constructor(client, proc, profile) {
    this.client = client;
    this.proc = proc;
    this.profile = profile;
    this.context = null;
  }
  send(name, params) {
    return this.client.send(name, params);
  }
  async setContext(value) {
    if (this.context !== value) await this.send('Marionette:SetContext', { value });
    this.context = value;
  }
  content() {
    return this.setContext('content');
  }
  /** Runs a function body in the current page (content) or in Firefox's own UI (chrome). */
  async eval(script, args = [], where = 'content') {
    await this.setContext(where);
    const result = await this.send('WebDriver:ExecuteScript', { script, args, ...(where === 'chrome' ? { sandbox: 'system' } : {}) });
    return result?.value;
  }
  async evalAsync(script, args = [], where = 'content') {
    await this.setContext(where);
    const result = await this.send('WebDriver:ExecuteAsyncScript', { script, args, scriptTimeout: 30000 });
    return result?.value;
  }
  chrome(script, args) {
    return this.eval(script, args, 'chrome');
  }
  async goto(url) {
    await this.content();
    for (let attempt = 0; ; attempt++) {
      try {
        await this.send('WebDriver:Navigate', { url });
        return;
      } catch (e) {
        if (/timeout/i.test(e.message)) return;
        // A tab that was just opened may not have its browser yet.
        if (attempt < 3 && /contentBrowser is null|discarded/.test(e.message)) {
          await sleep(500);
          if (this.lastHandle) await this.send('WebDriver:SwitchToWindow', { handle: this.lastHandle, focus: true }).catch(() => {});
        } else throw e;
      }
    }
  }
  async url() {
    await this.content();
    return (await this.send('WebDriver:GetCurrentURL')).value;
  }
  async handles() {
    await this.content();
    return (await this.send('WebDriver:GetWindowHandles')) ?? [];
  }
  async current() {
    await this.content();
    return (await this.send('WebDriver:GetWindowHandle')).value;
  }
  async newTab() {
    const { handle } = await this.send('WebDriver:NewWindow', { type: 'tab' });
    await sleep(300);
    await this.switchTo(handle);
    return handle;
  }
  async switchTo(handle) {
    await this.content();
    await this.send('WebDriver:SwitchToWindow', { handle, focus: true });
    this.lastHandle = handle;
  }
  async closeTab() {
    await this.content();
    return this.send('WebDriver:CloseWindow');
  }
  /** Installs the add-on temporarily (works on release Firefox, any version). */
  async install(dir = DIST) {
    return (await this.send('Addon:Install', { path: dir.replace(/\//g, '\\'), temporary: true })).value;
  }
  /** Grants an add-on's host permissions, as the user would from the extensions button (older Firefox doesn't by default). */
  async grantHosts(id, origins) {
    return this.evalAsync(
      `const [id, origins, done] = arguments;
       const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
       const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
       const ext = ExtensionParent.GlobalManager.getExtension(id);
       ExtensionPermissions.add(id, { permissions: [], origins }, ext).then(() => done('granted'), (e) => done(String(e)));`,
      [id, origins],
      'chrome'
    );
  }
  async setCookies() {
    await this.goto('https://www.youtube.com/robots.txt');
    for (const [name, value] of [['SOCS', 'CAI'], ['PREF', 'f6=400']]) {
      await this.send('WebDriver:AddCookie', { cookie: { name, value, domain: '.youtube.com', path: '/' } });
    }
  }
  /** A real pointer action at page coordinates (CSS pixels relative to the viewport). */
  async pointer(x, y, { button = 0, keys = [], type = 'click' } = {}) {
    await this.content();
    const keyDown = keys.map((value) => ({ type: 'keyDown', value }));
    const keyUp = keys.map((value) => ({ type: 'keyUp', value }));
    const actions = [
      { type: 'key', id: 'kbd', actions: [...keyDown, { type: 'pause' }, { type: 'pause' }, { type: 'pause' }, ...keyUp] },
      {
        type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport' },
          { type: 'pointerDown', button },
          { type: 'pointerUp', button },
        ],
      },
    ];
    if (keys.length === 0) actions.shift();
    await this.send('WebDriver:PerformActions', { actions });
    await this.send('WebDriver:ReleaseActions');
  }
  async keys(sequence) {
    await this.content();
    const actions = [];
    for (const key of sequence) actions.push({ type: 'keyDown', value: key });
    for (const key of [...sequence].reverse()) actions.push({ type: 'keyUp', value: key });
    await this.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kbd', actions }] });
    await this.send('WebDriver:ReleaseActions');
  }
  async center(selector) {
    return this.eval(`const el = document.querySelector(arguments[0]); if (!el) throw new Error('no ' + arguments[0] + ' on ' + location.href); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.x + Math.min(20, r.width / 2), y: r.y + r.height / 2 };`, [selector]);
  }
  /** Base URL of Cue's extension pages. */
  async extBase() {
    const host = await this.chrome(`return WebExtensionPolicy.getByID('queuetube@issac.com').mozExtensionHostname;`);
    return `moz-extension://${host}`;
  }
  /**
   * Runs async code with the extension's APIs, in a tab showing Cue's popup page, then goes back
   * to the tab that was active. The function body gets \`browser\` and must return a value.
   */
  async ext(body, args = []) {
    const back = await this.current();
    if (!this.extHandle || !(await this.handles()).includes(this.extHandle)) {
      this.extHandle = await this.newTab();
      await this.goto(`${await this.extBase()}/src/popup/index.html`);
    } else await this.switchTo(this.extHandle);
    const value = await this.evalAsync(
      `const done = arguments[arguments.length - 1];
       const browser = window.wrappedJSObject?.browser ?? window.browser ?? window.wrappedJSObject?.chrome;
       (async (...args) => { ${body} })(...Array.from(arguments).slice(0, -1)).then((v) => done(JSON.parse(JSON.stringify(v ?? null))), (e) => done({ error: String(e) }));`,
      args
    );
    await this.switchTo(back);
    return value;
  }
  async queueIds() {
    const q = await this.ext(`return (await browser.storage.local.get('queue')).queue;`);
    return (q?.entries ?? []).map((e) => e.videoId);
  }
  command(cmd) {
    return this.ext(`return browser.runtime.sendMessage(${JSON.stringify(cmd)});`);
  }
  async quit() {
    await this.send('Marionette:Quit').catch(() => {});
    await sleep(500);
    this.proc.kill();
  }
}

/** Opens Firefox's context menu at a point and returns its visible Cue items (or clicks one). */
export async function contextMenu(ff, x, y, clickLabel = null) {
  await ff.pointer(x, y, { button: 2 });
  await sleep(600);
  const FIND = `const menu = document.getElementById('contentAreaContextMenu');
     const ours = [...menu.querySelectorAll('menuitem, menu')].filter((el) => !el.hidden && !el.collapsed && /queuetube/.test(el.id));
     const item = arguments[0] && ours.find((el) => el.label === arguments[0] && el.localName === 'menuitem');`;
  const found = await ff.chrome(
    `${FIND}
     const state = menu.state;
     if (!item) menu.hidePopup();
     else if (item.parentNode !== menu) item.closest('menu').openMenu(true);
     return { state, labels: ours.map((el) => el.label), clicked: Boolean(item) };`,
    [clickLabel]
  );
  if (found.clicked) {
    await sleep(400);
    await ff.chrome(`${FIND} item.parentNode.activateItem(item);`, [clickLabel]);
  }
  return found;
}
