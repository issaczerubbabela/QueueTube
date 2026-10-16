# End-to-end verification

How to check Cue on real YouTube in Chromium and Firefox. Every ticket's "Verified end-to-end" criterion means following this.

Always rebuild first (`npm run build`) and test the `dist/` folder.

## Chromium (Playwright)

- Playwright's Chromium is at `~/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`. Playwright is not a repo dependency: `npm i playwright-core` in a scratch directory.
- Load `dist/` with `launchPersistentContext` and `--headless=new --disable-extensions-except=<dist> --load-extension=<dist>`.
- Set cookies on `.youtube.com` before visiting: `SOCS=CAI` (skips the consent wall) and `PREF=f6=400` (dark theme; `f6=80000` for light).
- The extension id comes from `ctx.serviceWorkers()[0].url()`. Drive state from the options page, e.g. `chrome.runtime.sendMessage({ type: 'queue/add', videoIds })`.
- Locators pierce the panel's shadow root: `#queuetube-host li.row`.
- `watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ` shows YouTube's own playlist panel right under Cue's, for comparing styles side by side.

## Firefox (puppeteer-core over BiDi)

- Firefox is installed at `C:/Program Files/Mozilla Firefox`. Use `puppeteer-core` with `browser: 'firefox'`, then `browser.installExtension(dist)`.
- Set the cookies on a youtube.com page *before* installing, and set the pref `extensions.originControls.grantByDefault: true`, or the content script never mounts.
- BiDi can't open or list `moz-extension://` pages, so fill the queue by opening watch URLs in new tabs (Auto-queue). To check popup/options CSS, snapshot their rendered HTML from Chromium (scripts stripped) and serve it next to a copy of `dist/` from a local http server.
- Theme: prefs `layout.css.prefers-color-scheme.content-override` / `ui.systemUsesDarkTheme`.

## Gotchas

- Pre-roll ads (`#movie_player.ad-showing`) block the `ended` → Advance path.
- Chrome silently drops suggested shortcuts that conflict with others (Alt+Shift+N/P did). Check `chrome.commands.getAll()`.
- Extension popups are capped at 600 px tall in both browsers.
- Claude in Chrome can't open `chrome://` pages, so ask the owner to reload the unpacked extension. It can also report "not connected" for a while after the owner connects it; retry later.
