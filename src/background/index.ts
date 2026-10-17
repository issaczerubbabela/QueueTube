// Background worker: routes tab events and UI commands into the queue model.
import browser from 'webextension-polyfill';
import * as P from '../domain/progress';
import * as Q from '../domain/queue';
import { FetchedPlaylist, fetchDuration, fetchPlaylist, fetchVideoInfo, isNewTabPage, isYouTubeSite, parseVideoId, parseVideoLink, startTimes } from '../domain/youtube';
import { Command, OptionsSection, PLAYLIST_CONFIRM_ABOVE, PlaylistReply, RoleQuery, Status, TabMessage } from '../shared/messages';
import { createMenus, onMenuClick } from './menus';
import { currentPlayer, electPlayer, focusPlayer, focusTab, loadVideo, setPlayer } from './player';
import {
  TabBook,
  forgetTab,
  loadBook,
  loadProgress,
  loadQueue,
  loadSettings,
  loadUndo,
  migrateLegacyState,
  saveBook,
  saveLastSeenVersion,
  saveProgress,
  saveQueue,
  saveSettings,
  saveUndo,
  serial,
} from './store';

/** Session-restore window: tabs created this soon after start-up are not fresh (ADR 0002). */
const STARTUP_GRACE_MS = 8000;

const blankVideo = (videoId: string): Q.Video => ({ videoId, title: '', channel: '', durationSec: null });

/** Loads a video in the player tab, resuming from its Watch progress. */
async function play(videoId: string): Promise<void> {
  await loadVideo(await loadBook(), videoId, P.resumeAt(await loadProgress(), videoId));
}

/**
 * Applies a queue operation and loads whatever video it asks for. The operation also gets the
 * Watched videos. Call only inside `serial`.
 */
async function apply(op: (queue: Q.Queue, settings: Q.Settings, watched: ReadonlySet<string>) => Q.Step | Q.Queue): Promise<void> {
  const [queue, settings, progress] = await Promise.all([loadQueue(), loadSettings(), loadProgress()]);
  const result = op(queue, settings, P.watchedVideos(progress));
  const step: Q.Step = 'play' in result ? result : { queue: result, play: null };
  if (step.queue !== queue) await saveQueue(step.queue);
  if (step.play) await play(step.play);
}

/** Applies a Watch progress change. Call only inside `serial`. */
async function applyProgress(op: (progress: P.ProgressMap) => P.ProgressMap): Promise<void> {
  const progress = await loadProgress();
  const next = op(progress);
  if (next !== progress) await saveProgress(next);
}

/**
 * Fetches details for new entries without holding up the serial queue. Titles come first
 * (cheap), durations after, a few at a time since each reads part of a watch page.
 */
function describeLater(videoIds: string[]): void {
  for (const videoId of videoIds) {
    fetchVideoInfo(videoId).then((info) => {
      if (info) serial(() => apply((q) => Q.describe(q, videoId, info)));
    });
  }
  const pending = [...videoIds];
  const worker = async () => {
    if (!(await loadSettings()).lookUpDurations) return;
    for (let videoId = pending.shift(); videoId; videoId = pending.shift()) {
      const known = (await loadQueue()).entries.find((e) => e.videoId === videoId)?.durationSec;
      if (known) continue;
      const durationSec = await fetchDuration(videoId);
      if (durationSec) await serial(() => apply((q) => Q.describe(q, videoId!, { durationSec })));
    }
  };
  for (let i = 0; i < 3; i++) worker();
}

/**
 * Adds videos to the queue (end, Play next or an index) and fetches their details. Start times
 * from their links (`t=`) replace saved Watch progress, whether or not the video was added.
 */
async function add(videoIds: string[], at: Q.Position = 'end', starts?: Record<string, number>): Promise<{ added: number }> {
  await applyProgress((p) => P.setStarts(p, starts));
  return addVideos(videoIds.map(blankVideo), at);
}

/** Adds videos whose details may already be known; only the missing ones are fetched. */
async function addVideos(videos: Q.Video[], at: Q.Position = 'end'): Promise<{ added: number }> {
  const before = (await loadQueue()).entries.length;
  await apply((q, s) => Q.enqueue(q, videos, s, at));
  describeLater([...new Set(videos.filter((v) => !v.title || !v.durationSec).map((v) => v.videoId))]);
  return { added: (await loadQueue()).entries.length - before };
}

// ── Playlists ────────────────────────────────────────────────────────────────

/** The last playlist read, so confirming a long one doesn't read it again. */
let lastPlaylist: { listId: string; at: number; playlist: FetchedPlaylist } | null = null;

async function readPlaylist(listId: string): Promise<FetchedPlaylist | null> {
  if (lastPlaylist?.listId === listId && Date.now() - lastPlaylist.at < 120_000) return lastPlaylist.playlist;
  const playlist = await fetchPlaylist(listId);
  if (playlist) lastPlaylist = { listId, at: Date.now(), playlist };
  return playlist;
}

/**
 * Queues a playlist at the end, in order. Long ones need `confirmed`. Reading the playlist
 * happens outside `serial`, so the queue stays responsive meanwhile.
 */
async function queuePlaylist(listId: string, confirmed = false): Promise<PlaylistReply> {
  const playlist = await readPlaylist(listId);
  if (!playlist) return { status: 'failed' };
  const total = playlist.videos.length;
  if (total > PLAYLIST_CONFIRM_ABOVE && !confirmed) return { status: 'confirm', total };
  const { added } = await serial(() => addVideos(playlist.videos));
  return { status: 'queued', added, total, complete: playlist.complete };
}

/** Asks "Queue all 742 videos?" in the tab a right-click came from. False if it can't ask there. */
async function confirmInTab(tabId: number | undefined, frameId: number | undefined, total: number): Promise<boolean> {
  if (tabId === undefined) return false;
  try {
    const [frame] = await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId ?? 0] },
      func: (n: number) => confirm(`Queue all ${n} videos?`),
      args: [total],
    });
    return frame?.result === true;
  } catch {
    return false;
  }
}

async function queuePlaylistFromMenu(listId: string, tabId?: number, frameId?: number): Promise<void> {
  const reply = await queuePlaylist(listId);
  if (reply.status === 'confirm' && (await confirmInTab(tabId, frameId, reply.total))) await queuePlaylist(listId, true);
}

/** Applies an operation that removes or rearranges entries, keeping what Undo needs to put them back. */
async function undoable(op: Parameters<typeof apply>[0]): Promise<void> {
  const { entries, currentId, stopAfterId } = await loadQueue();
  await apply(op);
  const after = await loadQueue();
  const changed = after.entries.length !== entries.length || after.entries.some((e, i) => e.id !== entries[i].id);
  if (entries.length > 0 && changed) await saveUndo({ entries, currentId, stopAfterId, currentAfter: after.currentId });
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

async function becomePlayer(book: TabBook, tabId: number, url: string | undefined): Promise<void> {
  await setPlayer(book, tabId);
  await apply((q) => Q.playerShowing(q, parseVideoId(url)));
}

/** A fresh tab landed on a watch page: queue the video and close the tab (or make it the player). */
async function autoQueue(book: TabBook, tab: browser.Tabs.Tab, videoId: string): Promise<void> {
  const tabId = tab.id!;
  forgetTab(book, tabId);
  await saveBook(book);

  const playerId = await currentPlayer(book);
  if (playerId === null) {
    // Only a www.youtube.com tab can host the panel; leave m.youtube.com tabs alone.
    return isYouTubeSite(tab.url) ? becomePlayer(book, tabId, tab.url) : undefined;
  }

  const settings = await loadSettings();
  if (!settings.autoQueue) return;

  const start = parseVideoLink(tab.url)?.start;
  if (start) await applyProgress((p) => P.setStart(p, videoId, start));
  await apply((q, s) => Q.enqueue(q, [blankVideo(videoId)], s));
  await browser.tabs.remove(tabId).catch(() => {});
  // Only pull the user to the player if they opened the video in the foreground.
  if (tab.active && settings.focusPlayerAfterQueueing) await focusTab(playerId).catch(() => {});
  describeLater([videoId]);
}

browser.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  serial(async () => {
    const book = await loadBook();
    if (Date.now() - book.bootAt < STARTUP_GRACE_MS) return;
    if (book.free.includes(tabId) || book.playerTabId === tabId) return;
    book.fresh = [...book.fresh, tabId];
    await saveBook(book);
  });
});

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  const url = change.url ?? (change.status === 'complete' ? tab.url : undefined);
  if (!url) return;
  serial(async () => {
    const book = await loadBook();

    if (tabId === book.playerTabId) {
      if (isYouTubeSite(url)) {
        if (change.url) await apply((q) => Q.playerShowing(q, parseVideoId(url)));
      } else if (!isNewTabPage(url)) {
        // The player tab left YouTube; it is no longer the player.
        await setPlayer(book, null);
        await apply((q) => Q.playerShowing(q, null));
      }
      return;
    }

    if (book.fresh.includes(tabId)) {
      if (isNewTabPage(url)) return;
      const videoId = parseVideoId(url);
      if (videoId) return autoQueue(book, tab, videoId);
      // Redirects (t.co, google.com/url…) never finish loading, so only a completed page settles the tab.
      if (change.status === 'complete') {
        forgetTab(book, tabId);
        await saveBook(book);
      } else {
        return;
      }
    }

    // Any YouTube page that finishes loading becomes the player when there is none.
    if (change.status === 'complete' && isYouTubeSite(url) && !book.free.includes(tabId)) {
      if ((await currentPlayer(book)) === null) await becomePlayer(book, tabId, url);
    }
  });
});

browser.tabs.onRemoved.addListener((tabId) => {
  serial(async () => {
    const book = await loadBook();
    const wasPlayer = book.playerTabId === tabId;
    forgetTab(book, tabId);
    if (wasPlayer) book.playerTabId = null;
    await saveBook(book);
    if (wasPlayer) await apply((q) => Q.playerShowing(q, null));
  });
});

// ── Commands ─────────────────────────────────────────────────────────────────

async function gather(): Promise<{ gathered: number }> {
  const book = await loadBook();
  let playerId = await currentPlayer(book);
  const candidates = (await browser.tabs.query({})).filter(
    (t) => t.id !== undefined && t.id !== playerId && !t.pinned && !book.free.includes(t.id) && isYouTubeSite(t.url) && parseVideoId(t.url)
  );
  if (candidates.length === 0) return { gathered: 0 };

  if (playerId === null) {
    // Keep the tab the user is looking at (or the first one) as the player.
    const [focused] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const player = candidates.find((t) => t.id === focused?.id) ?? candidates[0];
    playerId = player.id!;
    candidates.splice(candidates.indexOf(player), 1);
    await becomePlayer(book, playerId, player.url);
  }

  const links = candidates.map((t) => parseVideoLink(t.url)!);
  const videoIds = links.map((l) => l.videoId);
  await applyProgress((p) => P.setStarts(p, startTimes(links)));
  await apply((q, s) => Q.enqueue(q, videoIds.map(blankVideo), s));
  await browser.tabs.remove(candidates.map((t) => t.id!)).catch(() => {});
  await focusTab(playerId).catch(() => {});
  describeLater([...new Set(videoIds)]);
  return { gathered: candidates.length };
}

async function status(): Promise<Status> {
  const book = await loadBook();
  const playerTabId = await currentPlayer(book);
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const claimable = active?.id !== undefined && active.id !== playerTabId && isYouTubeSite(active.url);
  return { playerTabId, claimableTabId: claimable ? active.id! : null, canUndo: (await loadUndo()) !== null };
}

/** Opens the settings page, scrolled to a section when one is given. Reuses an open settings tab. */
async function openOptions(section?: OptionsSection): Promise<void> {
  if (!section) return browser.runtime.openOptionsPage();
  const page = browser.runtime.getURL('src/options/index.html');
  const url = `${page}#${section}`;
  const existing = (await browser.tabs.query({})).find((t) => t.url?.startsWith(page));
  if (existing?.id === undefined) {
    await browser.tabs.create({ url });
    return;
  }
  await browser.tabs.update(existing.id, { url });
  await focusTab(existing.id).catch(() => {});
}

async function handle(command: Command | RoleQuery, sender: browser.Runtime.MessageSender): Promise<unknown> {
  switch (command.type) {
    case 'tab/role': {
      const book = await loadBook();
      return { isPlayer: sender.tab?.id !== undefined && sender.tab.id === book.playerTabId };
    }
    case 'status':
      return status();
    case 'tabs/gather':
      return gather();

    case 'queue/add':
      return add(command.videoIds, command.at, command.starts);
    case 'queue/remove':
      return undoable((q) => Q.remove(q, command.entryId));
    case 'queue/clear':
      return undoable((q) => Q.clear(q));
    case 'queue/clearWatched':
      return undoable((q, _s, watched) => Q.clearWatched(q, watched));
    case 'queue/undo': {
      const snapshot = await loadUndo();
      if (!snapshot) return;
      await saveUndo(null);
      return apply((q) => Q.restore(q, snapshot));
    }
    case 'queue/move':
      return apply((q) => Q.move(q, command.entryId, command.toIndex));
    case 'queue/sort':
      return undoable((q) => Q.sortUpcoming(q, command.order));
    case 'queue/shuffle':
      return undoable((q) => Q.shuffleUpcoming(q));
    case 'queue/stopPoint':
      return apply((q) => Q.setStopPoint(q, command.entryId));
    case 'queue/playNextInLine':
      return apply((q) => Q.playNextInLine(q, command.entryId));
    case 'history/clear':
      return apply((q) => Q.clearHistory(q));

    case 'play/entry':
      return apply((q) => Q.jumpTo(q, command.entryId));
    case 'play/video':
      return play(command.videoId);
    case 'play/next':
      return apply((q, s, watched) => Q.advance(q, s, Q.systemClock, watched));
    case 'play/previous':
      return apply((q, s) => Q.goBack(q, s));

    case 'player/ended': {
      const book = await loadBook();
      if (sender.tab?.id !== book.playerTabId) return;
      if (command.videoId) await applyProgress((p) => P.markWatched(p, command.videoId!, command.durationSec ?? null));
      let stopped = false;
      await apply((q, s, watched) => {
        if (q.nowPlaying !== command.videoId) return q;
        const step = Q.videoEnded(q, s, Q.systemClock, watched);
        stopped = step.stopped;
        return step;
      });
      // At the Stop point: keep YouTube's own autoplay from taking over.
      if (stopped) await browser.tabs.sendMessage(book.playerTabId, { type: 'stopped' } satisfies TabMessage).catch(() => {});
      return;
    }
    case 'player/progress': {
      const book = await loadBook();
      if (sender.tab?.id !== book.playerTabId) return;
      const { videoId, positionSec, durationSec } = command;
      return applyProgress((p) => P.recordPosition(p, videoId, positionSec, durationSec));
    }
    case 'player/describe': {
      const { videoId, title, channel, durationSec } = command;
      return apply((q) => Q.describe(q, videoId, { title, channel, durationSec }));
    }
    case 'player/focus':
      return focusPlayer(await loadBook());
    case 'player/claimActiveTab': {
      const book = await loadBook();
      const { claimableTabId } = await status();
      if (claimableTabId === null) return;
      const tab = await browser.tabs.get(claimableTabId);
      return becomePlayer(book, claimableTabId, tab.url);
    }
    case 'tabs/openFree': {
      const book = await loadBook();
      const tab = await browser.tabs.create({ url: command.url, active: true });
      if (tab.id !== undefined) {
        book.free = [...book.free, tab.id];
        await saveBook(book);
      }
      return;
    }

    case 'options/open':
      return openOptions(command.section);
    case 'whatsNew/seen':
      return saveLastSeenVersion(browser.runtime.getManifest().version);
    case 'settings/update': {
      const settings = await loadSettings();
      return saveSettings({ ...settings, ...command.patch });
    }
  }
}

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  const command = message as Command | RoleQuery;
  if (!command || typeof command.type !== 'string') return undefined;
  // Reading a playlist takes a while; it takes its turn in `serial` only to add the videos.
  if (command.type === 'playlist/queue') return queuePlaylist(command.listId, command.confirmed);
  return serial(() => handle(command, sender));
});

onMenuClick(
  (videoIds, at, starts) => serial(() => add(videoIds, at, starts)),
  (listId, tabId, frameId) => queuePlaylistFromMenu(listId, tabId, frameId)
);

browser.commands?.onCommand.addListener((name) => {
  serial(async () => {
    if (name === 'gather-tabs') await gather();
    else if (name === 'next-video') await apply((q, s, watched) => Q.advance(q, s, Q.systemClock, watched));
    else if (name === 'previous-video') await apply((q, s) => Q.goBack(q, s));
    else if (name === 'toggle-queue') {
      const settings = await loadSettings();
      await saveSettings({ ...settings, sidebarCollapsed: !settings.sidebarCollapsed });
    }
  });
});

// ── Start-up ─────────────────────────────────────────────────────────────────

/** Once per browser launch or install: adopt an open YouTube tab and fill in missing details. */
function onLaunch(isBrowserStart: boolean) {
  createMenus().catch((err) => console.error('[Cue] Could not create the right-click menu', err));
  serial(async () => {
    await migrateLegacyState();
    const book = await loadBook();
    if (isBrowserStart) {
      book.bootAt = Date.now();
      await saveBook(book);
    }
    await browser.action?.setBadgeBackgroundColor({ color: '#d70015' });
    await saveQueue(await loadQueue()); // refreshes the badge
    if ((await currentPlayer(book)) === null) {
      const elected = await electPlayer(book);
      if (elected) await apply((q) => Q.playerShowing(q, elected.videoId));
    }
    const queue = await loadQueue();
    describeLater([...new Set([...queue.entries, ...queue.history].filter((v) => !v.title).map((v) => v.videoId))]);
  });
}

browser.runtime.onStartup.addListener(() => onLaunch(true));
browser.runtime.onInstalled.addListener(({ reason }) => {
  onLaunch(false);
  // A fresh install has nothing new to announce, and opens the Guide instead. An update leaves the
  // last version seen alone, so the What's new notice shows (including from 1.1.1, which never stored one).
  if (reason === 'install') {
    serial(async () => {
      await saveLastSeenVersion(browser.runtime.getManifest().version);
      await openOptions('guide');
    });
  }
});
