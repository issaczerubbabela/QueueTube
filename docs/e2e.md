# End-to-end verification

How to check Cue on real YouTube in Chromium and Firefox. Every ticket's "Verified end-to-end" criterion means following this.

Always rebuild first (`npm run build`) and test the `dist/` folder.

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

## Gotchas

- Always mute (`--mute-audio`, `media.volume_scale`): the watch page autoplays.
- Chromium re-installs a `--load-extension` extension on every launch (`onInstalled` says `install`), so a relaunch can't stand in for a browser restart or an update. Relaunching with changed files can also keep running the old cached service worker. Use the developer reload above.
- `chrome.runtime.reload()` and `developerPrivate.reload` unload the extension unless developer mode is on and Playwright's `--disable-extensions` default is dropped.

- Pre-roll ads (`#movie_player.ad-showing`) block the `ended` → Advance path.
- Chrome silently drops suggested shortcuts that conflict with others (Alt+Shift+N/P did). Check `chrome.commands.getAll()`.
- Extension popups are capped at 600 px tall in both browsers.
- Claude in Chrome can't open `chrome://` pages, so ask the owner to reload the unpacked extension. It can also report "not connected" for a while after the owner connects it; retry later.
