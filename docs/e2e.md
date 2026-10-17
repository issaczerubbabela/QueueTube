# End-to-end verification

How to check Cue on real YouTube in Chromium and Firefox. Every ticket's "Verified end-to-end" criterion means following this.

Always rebuild first (`npm run build`) and test the `dist/` folder.

## Running the scripts

The checks are scripts in `scripts/e2e/`, one per feature, in headless, muted Firefox over Marionette. They need no npm packages, only Firefox and a connection to YouTube.

```bash
npm run build
npm run e2e            # every script on this branch
npm run e2e -- 1.3     # one release: 1.2, 1.3, 1.4 or 1.5
npm run e2e -- resume  # scripts whose name contains "resume"
node scripts/e2e/resume-firefox.mjs   # one script on its own
```

Each script prints `PASS`/`FAIL` lines and an `n/m passed` tally, and exits non-zero on any failure. The runner ends with a summary per script. A full release takes a few minutes per script, since the videos really play.

Settings, as environment variables:

| Variable | Default | |
|---|---|---|
| `FIREFOX` | `C:/Program Files/Mozilla Firefox/firefox.exe` (Windows), the usual place elsewhere | Firefox to run |
| `CUE_DIST` | `<repo>/dist` | the built extension |
| `CUE_E2E_PROFILES` | `scripts/e2e/.profiles` (git-ignored) | throwaway Firefox profiles |
| `CUE_E2E_PREFS` | none | extra Firefox prefs as JSON, e.g. `{"network.proxy.type": 0}` |
| `CUE_E2E_SHOTS` | `scripts/e2e/.profiles/screenshots` | screenshots some scripts save for a person to look at |

What each release's scripts check (the full list is `RELEASES` in `scripts/e2e/run.mjs`):

| Release | Script | Ticket |
|---|---|---|
| 1.2 | `menu-firefox`, `alt-firefox`, `drop-firefox` | #4, #5, #6 |
| 1.3 | `resume-firefox` | #9 Watch progress and resume, including a browser restart and 1.2 data |
| 1.3 | `progress-bars-firefox` | #10 Progress bars; saves light and dark screenshots |
| 1.3 | `watched-firefox` | #11 Skip watched and Clear watched |
| 1.4 | `stop-point-firefox` | #13 Stop point and ends-at time |
| 1.4 | `sort-firefox` | #14 Sort and shuffle |
| 1.4 | `filter-firefox` | #15 Filter, including that typing doesn't trigger YouTube's shortcuts |
| 1.4 | `playlist-firefox` | #16 Queue a playlist, and its "check first": reading a playlist without sign-in, past the first page |

`playlist-firefox` finds a short (one page, under 100 videos) and a long (several pages) public playlist in YouTube's search results. To pin them, set `CUE_E2E_PLAYLIST` and `CUE_E2E_BIG_PLAYLIST` to playlist ids. It saves the long playlist's page data to `<profiles>/playlist-capture.json`, which can replace the hand-written fixture in `src/domain/fixtures/`.

The shared helpers are in `scripts/e2e/lib.mjs` (YouTube and panel helpers) and `scripts/e2e/ff.mjs` (the Marionette client). A browser restart is checked by quitting Firefox and relaunching it on the same profile (`launch(name, { keepProfile: true })`); prefs in `ff.mjs` keep a temporary add-on's storage across the reinstall.

Pre-roll ads are the usual cause of a timeout: a check that waits for a video to play gives up after 45 seconds. Run the script again.

## Chromium (Playwright)

- Playwright's Chromium is at `~/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`. Playwright is not a repo dependency: `npm i playwright-core` in a scratch directory.
- Load `dist/` with `launchPersistentContext` and `--headless=new --mute-audio --disable-extensions-except=<dist> --load-extension=<dist>`.
- **Updates** (e.g. from a 1.1.1 build made with `git archive <commit>`): load a copy of the old `dist/` with `ignoreDefaultArgs: ['--disable-extensions']` and only `--load-extension`. Then swap in the new files and, from a `chrome://extensions` page, call `chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })` and `chrome.developerPrivate.reload(id, { failQuietly: true })`. `onInstalled` then reports `update` with the right `previousVersion`. Patch the copy's manifest version to test a version bump.
- Change a shortcut from `chrome://extensions/shortcuts` with `chrome.developerPrivate.updateExtensionCommand({ extensionId, commandName, keybinding })`.
- Set cookies on `.youtube.com` before visiting: `SOCS=CAI` (skips the consent wall) and `PREF=f6=400` (dark theme; `f6=80000` for light).
- The extension id comes from `ctx.serviceWorkers()[0].url()`. Drive state from the options page, e.g. `chrome.runtime.sendMessage({ type: 'queue/add', videoIds })`.
- Locators pierce the panel's shadow root: `#queuetube-host li.row`.
- `watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ` shows YouTube's own playlist panel right under Cue's, for comparing styles side by side.

## Firefox (puppeteer-core over BiDi)

- Firefox is installed at `C:/Program Files/Mozilla Firefox`. Use `puppeteer-core` with `browser: 'firefox'`, then `browser.installExtension(dist)`. Installing again with the same gecko id is an update.
- Mute it with the pref `media.volume_scale: '0.0'`.
- Set the cookies on a youtube.com page *before* installing, and set the pref `extensions.originControls.grantByDefault: true`, or the content script never mounts.
- BiDi can't open or list `moz-extension://` pages (an extension tab shows up in `browser.pages()` as `about:blank`, so count tabs to see one open), so fill the queue by opening watch URLs in new tabs (Auto-queue). To check popup/options CSS, snapshot their rendered HTML from Chromium (scripts stripped) and serve it next to a copy of `dist/` from a local http server.
- Theme: prefs `layout.css.prefers-color-scheme.content-override` / `ui.systemUsesDarkTheme`.

## Right-click menus

- **Firefox, headless:** drive Firefox with Marionette alone (Firefox allows one automation session, so not alongside puppeteer's BiDi). Start `firefox.exe --headless --marionette -remote-allow-system-access --no-remote --profile <dir>` with prefs in the profile's `user.js` (`marionette.port`, the mute and `grantByDefault` prefs above). `Addon:Install { path, temporary: true }` installs `dist/` on any Firefox version. A right-click through `WebDriver:PerformActions` (button 2) really opens `#contentAreaContextMenu` even headless. In the chrome context (`Marionette:SetContext`), Cue's items are the visible `menuitem`/`menu` elements whose id contains `queuetube`. Open the "Cue for YouTube" submenu with `menu.openMenu(true)` and click with `popup.activateItem(item)`.
- **Chromium, headless:** there is no native menu. Fire a click from the service worker with `chrome.contextMenus.onClicked.dispatch(info, { id: tabId })`. This does not grant `activeTab`, so "Queue all YouTube links here" on a non-YouTube page only reaches the selected-text fallback there.
- **Chromium, which items show:** only a headed browser draws the native menu. Right-click with Playwright, then read and click it through Windows UI Automation (`System.Windows.Automation`, filtering top-level elements by the browser's process ids). CDP's Escape doesn't close a native menu; close the tab instead.
- Extension pages over Marionette: `WebExtensionPolicy.getByID('queuetube@issac.com').mozExtensionHostname` (chrome context) gives the `moz-extension://` host. Open `src/popup/index.html` in a tab and call `window.wrappedJSObject.browser` there to send Commands or read storage.

## Gotchas

- Always mute (`--mute-audio`, `media.volume_scale`): the watch page autoplays.
- Chromium re-installs a `--load-extension` extension on every launch (`onInstalled` says `install`), so a relaunch can't stand in for a browser restart or an update. Relaunching with changed files can also keep running the old cached service worker. Use the developer reload above.
- `chrome.runtime.reload()` and `developerPrivate.reload` unload the extension unless developer mode is on and Playwright's `--disable-extensions` default is dropped.

- Pre-roll ads (`#movie_player.ad-showing`) block the `ended` → Advance path.
- Chrome silently drops suggested shortcuts that conflict with others (Alt+Shift+N/P did). Check `chrome.commands.getAll()`.
- Extension popups are capped at 600 px tall in both browsers.
- Claude in Chrome can't open `chrome://` pages, so ask the owner to reload the unpacked extension. It can also report "not connected" for a while after the owner connects it; retry later.
