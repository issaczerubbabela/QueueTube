# Handoff (WIP branch `wip/7-media-keys`, branched from release/1.2 @ 4e0a95d)

Delete this file when the work is merged into the release branches.

## State of #7 (Media keys and Shift+N follow the Queue)
Check-first findings are already posted on issue #7. Code on this branch (uncommitted-then-committed WIP, builds, 70 unit tests pass):
- `src/domain/queue.ts` + test: `queueDirections(queue, settings)`
- `src/content/page.ts`: page-context script (patches `MediaSession.prototype.setActionHandler`, window-capture Shift+N); self-injects as `<script>` when `world: "MAIN"` is ignored (Firefox < 128)
- `src/content/mediaControls.ts`: player-tab side; marks `data-cue-next/previous` on `<html>`, turns `cue-media` events into `play/next` / `play/previous` Commands
- manifest: MAIN-world content script + `web_accessible_resources`; `scripts/build.js` builds `page/index.js`
- Firefox 157 headless: 24/26 e2e pass. Open: (a) the "with nothing next, Shift+N gets past Cue untouched" probe reads "no" (likely a test-listener problem, since "falls back to YouTube" passes), (b) a "Browsing context has been discarded" error switching tabs at the end of the test.

Still to do for #7: fix/triage those two, run the same test on Firefox 121 (download from archive.mozilla.org, extract with 7-Zip, pass the exe path as argv[2]), write ADR 0003 (patching page globals), Guide entry, CHANGELOG line, commit `feat: Media keys and Shift+N follow the Queue (#7)` on `release/1.2`, comment and close #7.

## Owner instructions that apply
- End-to-end checks: **Firefox only, headless, muted** (no Chromium, no headed). Say in ticket comments that Chromium was skipped at the owner's request.
- Only the owner merges release branches into `main` (ship tickets #8, #12, #17, #20 are `ready-for-human`).

## E2E harness
`scripts/e2e/` (Marionette client in `ff.mjs`, helpers in `lib.mjs`). It was written for Windows: `DIST` and `FIREFOX` paths in `lib.mjs` are hardcoded, and `ROOT` is expected to hold `profiles/`. Adjust paths for the environment. Needs `npm i` inside `scripts/e2e`. Firefox needs `-remote-allow-system-access` (already passed by `ff.mjs`). Recipes are in `docs/e2e.md`.
