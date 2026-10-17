# Cue Architecture

Vocabulary (player tab, entry, current entry, fresh tab, auto-queue, gather) is defined in [`CONTEXT.md`](../CONTEXT.md). Key decisions are in [`docs/adr/`](adr/).

```text
src/
├── domain/            Pure, browser-free, unit-tested
│   ├── queue.ts       The queue model: enqueue, advance, goBack, move, playerShowing…
│   ├── progress.ts    Watch progress per video: the 30 s / 90% rules, Watched, resume point, 500-video cap
│   ├── shelf.ts       The Shelf: move to and from the Queue; a video is never in both
│   ├── youtube.ts     What counts as YouTube; URL → video id and t=; oEmbed/duration lookups
│   └── changelog.ts   CHANGELOG.md → versions of headings and bullets for What's new
├── shared/
│   ├── messages.ts    The Command protocol (UI/content → background)
│   └── state.ts       Storage layout + useExtensionState(), a read-only React view
├── background/        The only writer of state (ADR 0001)
│   ├── index.ts       Tab routing (fresh-tab rule, ADR 0002) and the command handler
│   ├── player.ts      Finding, electing and driving the player tab
│   ├── menus.ts       The right-click menu (Add to queue, Play next, Queue all YouTube links here)
│   └── store.ts       Serialized persistence, session bookkeeping, 1.0 → 1.1 migration
├── content/           Runs on www.youtube.com; mounts the panel in the player tab only,
│                      reports playback position there (watchProgress.ts), pauses at the
│                      Stop point (stopPoint.ts); Alt+click everywhere
├── sidebar/           The in-page queue panel (Shadow DOM, styles inlined)
├── popup/ options/    Extension pages
└── ui/                Design system (theme.css) and shared components
```

## Data flow

1. A surface sends a `Command` (`send({ type: 'play/next' })`).
2. The background runs it inside `serial()`, applying a pure function from `domain/queue.ts`, which returns the new queue and, optionally, a video to load.
3. The background writes `storage.local` and, if needed, navigates the player tab.
4. Every surface re-renders from `storage.onChanged`.

Watch progress has its own `progress` key in `storage.local`, apart from the queue: the player tab reports its position every ~10 seconds, and keeping those writes out of the `queue` key means they don't re-render everything that reads the queue. `useExtensionState()` ignores changes to other keys. Resuming is done by loading the player tab with `&t=<seconds>`, which YouTube honours.

The Shelf has its own `shelf` key. `apply()` in the background enforces "never in both places" once for every route: after any queue change it takes newly queued videos off the Shelf.

Tab bookkeeping (player tab id, fresh tabs, free tabs, undo snapshot) lives in `storage.session`: it survives the MV3 worker sleeping but is forgotten when the browser restarts, when tab ids become meaningless.

`CHANGELOG.md` at the repo root is the only source for the settings page's What's new section: the build bundles it (`?raw`) and `domain/changelog.ts` parses it. The `lastSeenVersion` key in `storage.local` drives the What's new notice; a fresh install sets it on the `install` event, so only updates show the notice.

The settings page's Guide is the list in `src/options/guideEntries.ts`: one entry per feature, grouped by task, optionally naming a manifest command (its live shortcut is shown) and a setting row to link to. Each new feature adds an entry there. A fresh install opens settings at `#guide`.

## Testing

- `npm test` runs the domain unit tests (Vitest).
- The panel, popup and background are exercised end-to-end on real YouTube by the scripts in `scripts/e2e/` (`npm run e2e`, see [`e2e.md`](e2e.md)).
