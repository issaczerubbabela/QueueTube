# Roadmap: 1.2 → 1.5

Vocabulary (Entry, Current entry, Shelf, Watched, Watch progress, Stop point…) is defined in [`CONTEXT.md`](../CONTEXT.md). This plan came out of a design interview on 2026-10-17; the decisions it records are listed at the end.

## Working agreement

- One branch per release (`release/1.2`, …), one commit per feature, merged once the release is verified on real YouTube in Chromium and Firefox. The version is bumped once per release.
- A feature is **done** when it has:
  1. domain logic in `src/domain/` with unit tests (where there is logic to test),
  2. a **Guide** entry,
  3. a line in `CHANGELOG.md`,
  4. an end-to-end check on real YouTube.
- New terms go into `CONTEXT.md` as they are settled; ADRs only for decisions that are hard to reverse, surprising and a real trade-off.

## 1.2: Adding videos

Goal: you can queue a video without opening it in a new tab, and YouTube's own "next" controls follow the queue.

0. **Guide, changelog, What's new** (ships first; later features only add entries)
   - `CHANGELOG.md` at the repo root, with entries for 1.0, 1.1.0 and 1.1.1 written up from git history.
   - Options page: new **Guide** section at the top of the nav, grouped as Adding videos · Playing · Organizing · Picking up where you left off · Your data. One line per feature on what it does and how to use it. Shortcuts are read from `commands.getAll()`, and rows link to their setting.
   - Options page: **What's new** section that renders `CHANGELOG.md` (imported with `?raw`, using a small renderer for headings and bullets).
   - First install opens the options page at the Guide. After an update, a "What's new in X" chip appears in the popup and the panel's ⋮ menu until the changelog is opened (the last version seen is kept in `storage.local`).
   - "Guide" link in the panel's ⋮ menu and in the popup.
1. **Right-click menu** (`contextMenus` permission)
   - On YouTube video links on any site: *Add to queue*, *Play next*.
   - On a page or a selection: *Queue all YouTube links here* (reuses `findVideoIds()`).
2. **Alt+click / Alt+Shift+click** on any video link in any www.youtube.com tab, including the Player tab: Alt+click adds to the end of the queue, Alt+Shift+click adds as Play next. Cancels the browser's default (Chrome downloads the link on Alt+click). The clicked thumbnail shows a brief "Queued" confirmation. One delegated click listener that only looks at the link, so it does not depend on YouTube's markup.
3. **Drop a video onto the panel**: a YouTube link dragged from the page is added where it is dropped, using the same drop logic as reordering.
4. **Middle-click hint** in the empty state of the panel and the popup: *"Middle-click or Alt+click any video to queue it."*
5. **Media keys and Shift+N follow the queue**
   - Check first: how YouTube registers its `mediaSession` handlers and Shift+N, and whether a script in the page's own context (`world: "MAIN"`) can be used at `strict_min_version` 121 in Firefox, or whether it has to be injected another way.
   - Next or previous goes to the queue when it has a video in that direction, and otherwise falls back to YouTube's own behaviour.
   - Consider an ADR if taking over YouTube's own controls turns out to be invasive.

## 1.3: Resume

1. **Watch progress** (new `progress` storage key, keyed by video id, kept for the 500 most recently updated videos)
   - The content script reports the position about every 10 seconds and on pause or page hide. The background script is the only writer (ADR 0001).
   - Saved only between 30 seconds in and the Watched mark; reaching the Watched mark clears it.
   - Playback resumes from the saved position whenever QueueTube loads a video in the Player tab.
   - A `t=` in an incoming link replaces the saved Watch progress for that video. `parseVideoId` has to start returning the start time as well.
   - Kept in its own storage key, so frequent position writes don't re-render everything that reads the queue.
2. **Progress bars** on Queue and History rows.
3. **Watched** = ended, or Watch progress ≥ 90%.
   - Setting **Skip watched** (off by default): when the queue moves on, it passes over Watched entries and leaves them in the queue.
   - **Clear watched** in the ⋮ menu removes Watched entries and can be undone.

## 1.4: Control

1. **Stop point**: at most one per queue, set from an entry's ⋮ menu and shown on that row ("⏸ stops after this"). When that entry ends, the player pauses instead of moving on and the Stop point clears itself.
2. **Finishes at** in the panel header: "1 h 12 m left · ends 10:42 pm", using the videos still to come.
3. **Sort and shuffle** (⋮ menu): shortest first, longest first, by channel, shuffle. They permanently rearrange only the videos after the current one, and can be undone with the existing Undo snapshot.
4. **Filter** box above the list (title or channel). Drag-to-reorder is turned off while filtering.
5. **Queue a playlist**
   - Check first: can the background script fetch a `/playlist?list=` page and read every video from the playlist data embedded in the page (`ytInitialData`), including playlists longer than one page?
   - Right-click *Add playlist to queue* on playlist links, plus a *Queue this playlist* button on `/playlist` pages and in the panel while a playlist is open.
   - A new tab opening `watch?v=X&list=Y` still only queues X.
   - More than 100 videos asks first ("Queue all 742 videos?"). Duplicates follow *Allow duplicates*.

## 1.5: Shelf and sharing

1. **Shelf** (new `shelf` storage key)
   - The panel gets a third tab: Queue · Shelf · History.
   - *Move to shelf* from a Queue entry. *Back to queue* (end or Play next) from a Shelf video. Dragging between the Queue and Shelf tabs works too.
   - Queueing a video that is on the Shelf, by any route, *moves* it off the Shelf.
   - No current entry, no undo and no History for the Shelf.
2. **Copy share link**: `youtube.com/watch_videos?video_ids=…` built from the current entry and the ones after it, up to 50 ("Shared first 50 of 73"). Check that YouTube still accepts the link before building it. Import accepts these links (`findVideoIds()` learns the format).

## Not doing for now

- **Hover "+" button on thumbnails**: the easiest thing for a YouTube redesign to break. Alt+click and the right-click menu cover the same need.
- **`storage.sync`**: two devices would each have a Player tab while sharing one queue, which breaks the single-writer model (ADR 0001) across devices.
- **Sleep timer**: the Stop point covers most of the need.
- **Multiple named queues**: the Queue stays singular, and the Shelf covers setting videos aside.

## Separate track: store publishing

The extension is renamed **Cue** (store name "Cue for YouTube", short name "Cue"), because two Chrome Web Store extensions are already called "QueueTube". It is already listed on Firefox Add-ons as QueueTube: rename that listing's display name but keep its `queuetube` slug and the gecko id `queuetube@issac.com`, so existing installs keep updating. The repo name and the in-page panel's element id stay as they are. Before publishing to the Chrome Web Store, search both stores directly for "Cue" to rule out a collision.

## Decisions log (2026-10-17)

| # | Decision |
|---|---|
| Q1 | Publish to both stores and rename before the first public release |
| Q2 | Cut the hover button, sync, sleep timer and multiple queues |
| Q3 | Releases 1.2 adding videos → 1.3 resume → 1.4 control → 1.5 Shelf and sharing |
| Q4 | Alt+click adds to the end, Alt+Shift+click adds as Play next |
| Q5 | Right-click menu: Add to queue, Play next, Queue all links here (no "Play now") |
| Q6 | Media keys use the queue when it has a video in that direction, otherwise YouTube's own behaviour |
| Q7 | Watch progress is per video, not per entry |
| Q8 | Playlists are queued only on request, never automatically by opening a new tab |
| Q9 | Sort and shuffle permanently rearrange the videos still to come, with undo |
| Q10 | One Stop point per queue, which clears itself |
| Q11 | A "Shelf", separate from the Queue |
| Q12 | Watched = ended or ≥ 90% |
| Q13 | Saved between 30 s and 90%, for 500 videos; `t=` replaces it |
| Q14 | Skip watched leaves videos in the queue; Clear watched removes them |
| Q15 | Large playlists ask before queueing more than 100 videos |
| Q16 | Share link includes up to 50 videos and can be imported |
| Q17 | Empty-state hint, finishes-at, filter, drop where released |
| Q18 | A branch per release |
| Q19 | Queueing a video that is on the Shelf moves it off the Shelf |
| Q20 | `CHANGELOG.md` is the only source for What's new |
| Q21 | Guide section in settings, grouped by task |
| Q22 | Open the Guide on install; a What's new chip after updates |
| Q23 | Past versions written up; Guide and changelog entries are part of done |
