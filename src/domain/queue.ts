// The queue model. Pure functions only: every operation takes a Queue and returns a new one,
// plus the video the player tab should switch to, if any. See CONTEXT.md for the vocabulary.

export interface Video {
  videoId: string;
  /** Empty until metadata arrives. */
  title: string;
  channel: string;
  durationSec: number | null;
}

export interface Entry extends Video {
  id: string;
  addedAt: number;
}

export interface HistoryItem extends Video {
  playedAt: number;
}

export interface Queue {
  entries: Entry[];
  currentId: string | null;
  /** The video the player tab is showing, whether or not it is queued. */
  nowPlaying: string | null;
  history: HistoryItem[];
  /** The Stop point: the entry after which playback pauses instead of Advancing. */
  stopAfterId: string | null;
}

export interface Settings {
  autoQueue: boolean;
  allowDuplicates: boolean;
  removeAfterPlaying: boolean;
  focusPlayerAfterQueueing: boolean;
  autoAdvance: boolean;
  lookUpDurations: boolean;
  sidebarCollapsed: boolean;
  /** When the queue Advances, pass over Watched entries (they stay in the queue). */
  skipWatched: boolean;
}

export const EMPTY_QUEUE: Queue = { entries: [], currentId: null, nowPlaying: null, history: [], stopAfterId: null };

export const DEFAULT_SETTINGS: Settings = {
  autoQueue: true,
  allowDuplicates: false,
  removeAfterPlaying: false,
  focusPlayerAfterQueueing: true,
  autoAdvance: true,
  lookUpDurations: true,
  sidebarCollapsed: false,
  skipWatched: false,
};

export const HISTORY_LIMIT = 50;

/** Result of an operation: the new queue, and the video to load in the player (if it should change). */
export interface Step {
  queue: Queue;
  play: string | null;
}

export interface Clock {
  now(): number;
  newId(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  newId: () => `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
};

const stay = (queue: Queue): Step => ({ queue, play: null });

/** Drops the Stop point when its entry has left the queue. */
const keepStop = (queue: Queue): Queue =>
  queue.stopAfterId === null || queue.entries.some((e) => e.id === queue.stopAfterId) ? queue : { ...queue, stopAfterId: null };

/** No videos: the default for the Watched videos an operation passes over. */
const NONE: ReadonlySet<string> = new Set();

// ── Queries ──────────────────────────────────────────────────────────────────

export function currentIndex(queue: Queue): number {
  return queue.currentId === null ? -1 : queue.entries.findIndex((e) => e.id === queue.currentId);
}

export function currentEntry(queue: Queue): Entry | null {
  return queue.entries[currentIndex(queue)] ?? null;
}

/** The entry "next" would play, passing over any videos in `skip` (Watched ones, with Skip watched on). */
export function nextEntry(queue: Queue, skip: ReadonlySet<string> = NONE): Entry | null {
  return queue.entries.find((e, i) => i > currentIndex(queue) && !skip.has(e.videoId)) ?? null;
}

/** The videos Advance passes over: the Watched ones when Skip watched is on, otherwise none. */
export function skipped(settings: Pick<Settings, 'skipWatched'>, watched: ReadonlySet<string>): ReadonlySet<string> {
  return settings.skipWatched ? watched : NONE;
}

/** Entries after the current one. */
export function upcoming(queue: Queue): Entry[] {
  return queue.entries.slice(currentIndex(queue) + 1);
}

/** True when the current entry is the video on screen. */
export function isCurrentPlaying(queue: Queue): boolean {
  const current = currentEntry(queue);
  return current !== null && current.videoId === queue.nowPlaying;
}

export function canGoBack(queue: Queue, settings: Settings): boolean {
  return (!settings.removeAfterPlaying && currentIndex(queue) > 0) || queue.history.length > 0;
}

// ── Commands ─────────────────────────────────────────────────────────────────

/** Where new entries go: the end, right after the current entry ("Play next"), or an index. */
export type Position = 'end' | 'next' | number;

export function enqueue(
  queue: Queue,
  videos: Video[],
  settings: Pick<Settings, 'allowDuplicates'>,
  at: Position = 'end',
  clock: Clock = systemClock
): Queue {
  const seen = new Set(queue.entries.map((e) => e.videoId));
  const added: Entry[] = [];
  for (const video of videos) {
    if (!settings.allowDuplicates && seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    added.push({ ...video, id: clock.newId(), addedAt: clock.now() });
  }
  if (added.length === 0) return queue;
  const index =
    at === 'end' ? queue.entries.length : at === 'next' ? currentIndex(queue) + 1 : Math.max(0, Math.min(at, queue.entries.length));
  const entries = [...queue.entries];
  entries.splice(index, 0, ...added);
  return { ...queue, entries };
}

export function remove(queue: Queue, entryId: string): Queue {
  const index = queue.entries.findIndex((e) => e.id === entryId);
  if (index < 0) return queue;
  const entries = queue.entries.filter((e) => e.id !== entryId);
  // Removing the current entry leaves the cursor just before the entry that followed it,
  // so "next" still plays that one.
  const currentId =
    queue.currentId === entryId ? (entries[index - 1]?.id ?? null) : queue.currentId;
  return keepStop({ ...queue, entries, currentId });
}

/** Moves an entry so it ends up at `toIndex` in the resulting list. */
export function move(queue: Queue, entryId: string, toIndex: number): Queue {
  const from = queue.entries.findIndex((e) => e.id === entryId);
  if (from < 0) return queue;
  const to = Math.max(0, Math.min(toIndex, queue.entries.length - 1));
  if (from === to) return queue;
  const entries = [...queue.entries];
  const [moved] = entries.splice(from, 1);
  entries.splice(to, 0, moved);
  return { ...queue, entries };
}

/** Moves an entry to play right after the current one. */
export function playNextInLine(queue: Queue, entryId: string): Queue {
  const from = queue.entries.findIndex((e) => e.id === entryId);
  if (from < 0 || entryId === queue.currentId) return queue;
  const cursor = currentIndex(queue);
  return move(queue, entryId, from > cursor ? cursor + 1 : cursor);
}

export function clear(queue: Queue): Queue {
  return { ...queue, entries: [], currentId: null, stopAfterId: null };
}

/**
 * Removes the entries whose video is Watched. If the current entry goes, the cursor stays just
 * before the entry that followed it, as with `remove`. Undo restores them like a clear.
 */
export function clearWatched(queue: Queue, watched: ReadonlySet<string>): Queue {
  if (!queue.entries.some((e) => watched.has(e.videoId))) return queue;
  const index = currentIndex(queue);
  const entries = queue.entries.filter((e) => !watched.has(e.videoId));
  const keptBefore = queue.entries.slice(0, index + 1).filter((e) => !watched.has(e.videoId));
  return keepStop({ ...queue, entries, currentId: keptBefore[keptBefore.length - 1]?.id ?? null });
}

export function clearHistory(queue: Queue): Queue {
  return { ...queue, history: [] };
}

export function jumpTo(queue: Queue, entryId: string): Step {
  const entry = queue.entries.find((e) => e.id === entryId);
  if (!entry) return stay(queue);
  return { queue: { ...queue, currentId: entry.id }, play: entry.videoId };
}

function recordHistory(history: HistoryItem[], video: Video, now: number): HistoryItem[] {
  const { videoId, title, channel, durationSec } = video;
  const item: HistoryItem = { videoId, title, channel, durationSec, playedAt: now };
  return [item, ...history.filter((h) => h.videoId !== videoId)].slice(0, HISTORY_LIMIT);
}

/**
 * Moves to the entry after the current one. At the end of the queue nothing plays. With Skip
 * watched on, Watched entries (`watched`) are passed over and stay in the queue.
 */
export function advance(queue: Queue, settings: Settings, clock: Clock = systemClock, watched: ReadonlySet<string> = NONE): Step {
  const current = currentEntry(queue);
  const next = nextEntry(queue, skipped(settings, watched));
  if (!next) {
    if (!current || !settings.removeAfterPlaying) return stay(queue);
    // The last entry finished: it leaves the queue, and nothing else plays.
    return stay(keepStop({
      ...queue,
      entries: queue.entries.filter((e) => e.id !== current.id),
      history: recordHistory(queue.history, current, clock.now()),
      currentId: null,
    }));
  }

  let entries = queue.entries;
  let history = queue.history;
  if (current) {
    history = recordHistory(history, current, clock.now());
    if (settings.removeAfterPlaying) entries = entries.filter((e) => e.id !== current.id);
  }
  return { queue: keepStop({ ...queue, entries, history, currentId: next.id }), play: next.videoId };
}

// ── Sort and shuffle ─────────────────────────────────────────────────────────

export type SortOrder = 'shortest' | 'longest' | 'channel';

/** Replaces the entries after the current one (all of them, with nothing current). */
function rearrangeUpcoming(queue: Queue, rearrange: (entries: Entry[]) => Entry[]): Queue {
  const start = currentIndex(queue) + 1;
  const rest = rearrange(queue.entries.slice(start));
  if (rest.every((e, i) => e === queue.entries[start + i])) return queue;
  return { ...queue, entries: [...queue.entries.slice(0, start), ...rest] };
}

const byLength = (direction: 1 | -1) => (a: Entry, b: Entry) => {
  // Unknown lengths go last either way.
  if (a.durationSec === null || b.durationSec === null) return (a.durationSec === null ? 1 : 0) - (b.durationSec === null ? 1 : 0);
  return (a.durationSec - b.durationSec) * direction;
};
const byChannel = (a: Entry, b: Entry) => {
  if (!a.channel || !b.channel) return (a.channel ? 0 : 1) - (b.channel ? 0 : 1);
  return a.channel.localeCompare(b.channel, undefined, { sensitivity: 'base' });
};

/**
 * Sorts the entries still to come: shortest or longest first, or grouped by channel. The current
 * entry and those before it stay put; ties keep their order.
 */
export function sortUpcoming(queue: Queue, order: SortOrder): Queue {
  const compare = order === 'shortest' ? byLength(1) : order === 'longest' ? byLength(-1) : byChannel;
  return rearrangeUpcoming(queue, (rest) => [...rest].sort(compare));
}

/** Shuffles the entries still to come. `random` returns a number in [0, 1), like Math.random. */
export function shuffleUpcoming(queue: Queue, random: () => number = Math.random): Queue {
  return rearrangeUpcoming(queue, (rest) => {
    const shuffled = [...rest];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  });
}

// ── Stop point ───────────────────────────────────────────────────────────────

/** Sets the Stop point to an entry, replacing any other, or clears it with null. */
export function setStopPoint(queue: Queue, entryId: string | null): Queue {
  if (entryId !== null && !queue.entries.some((e) => e.id === entryId)) return queue;
  return queue.stopAfterId === entryId ? queue : { ...queue, stopAfterId: entryId };
}

/** True when the current entry is the Stop point: playback pauses once its video ends. */
export function stopsHere(queue: Queue): boolean {
  return queue.stopAfterId !== null && queue.stopAfterId === queue.currentId;
}

/**
 * The current video ended. At the Stop point playback stays paused and the Stop point clears
 * itself; otherwise the queue Advances if Auto-advance is on.
 */
export function videoEnded(
  queue: Queue,
  settings: Settings,
  clock: Clock = systemClock,
  watched: ReadonlySet<string> = NONE
): Step & { stopped: boolean } {
  if (stopsHere(queue)) return { queue: { ...queue, stopAfterId: null }, play: null, stopped: true };
  if (!settings.autoAdvance) return { ...stay(queue), stopped: false };
  return { ...advance(queue, settings, clock, watched), stopped: false };
}

/** Moves to the previous entry, or brings the last history item back to the front. */
export function goBack(queue: Queue, settings: Settings, clock: Clock = systemClock): Step {
  const index = currentIndex(queue);
  if (!settings.removeAfterPlaying && index > 0) {
    const previous = queue.entries[index - 1];
    return { queue: { ...queue, currentId: previous.id }, play: previous.videoId };
  }

  const [last, ...rest] = queue.history;
  if (!last) return stay(queue);
  const { playedAt: _playedAt, ...video } = last;
  const restored: Entry = { ...video, id: clock.newId(), addedAt: clock.now() };
  const entries = [...queue.entries];
  entries.splice(Math.max(index, 0), 0, restored);
  return {
    queue: { ...queue, entries, history: rest, currentId: restored.id },
    play: restored.videoId,
  };
}

/**
 * The player tab now shows `videoId` (or no video). If that video is queued, the queue moves
 * to it; otherwise the current entry stays put so "next" keeps its meaning.
 */
export function playerShowing(queue: Queue, videoId: string | null): Queue {
  const synced = { ...queue, nowPlaying: videoId };
  if (videoId === null || currentEntry(queue)?.videoId === videoId) return synced;

  const index = currentIndex(queue);
  const after = queue.entries.findIndex((e, i) => i > index && e.videoId === videoId);
  const anywhere = after >= 0 ? after : queue.entries.findIndex((e) => e.videoId === videoId);
  return anywhere >= 0 ? { ...synced, currentId: queue.entries[anywhere].id } : synced;
}

/** Fills in details for every entry and history item showing `videoId`. */
export function describe(queue: Queue, videoId: string, details: Partial<Video>): Queue {
  const known = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== '' && value != null)
  ) as Partial<Video>;
  if (Object.keys(known).length === 0) return queue;

  let changed = false;
  const patch = <T extends Video>(item: T): T => {
    if (item.videoId !== videoId) return item;
    const next = { ...item, ...known };
    if (next.title !== item.title || next.channel !== item.channel || next.durationSec !== item.durationSec) {
      changed = true;
      return next;
    }
    return item;
  };
  const entries = queue.entries.map(patch);
  const history = queue.history.map(patch);
  return changed ? { ...queue, entries, history } : queue;
}

/** What Undo needs: the entries and current entry before a change, and where the change left the cursor. */
export interface UndoSnapshot extends Pick<Queue, 'entries' | 'currentId'> {
  stopAfterId?: string | null;
  /** The current entry right after the change; if it is still current, nothing has played since. */
  currentAfter?: string | null;
}

/**
 * Undoes a remove or clear: brings back the entries from `before` in their old order, keeps
 * anything added since, and restores the old current entry unless the queue has moved on since.
 */
export function restore(queue: Queue, before: UndoSnapshot): Queue {
  const known = new Set(before.entries.map((e) => e.id));
  const addedSince = queue.entries.filter((e) => !known.has(e.id));
  const entries = [...before.entries, ...addedSince];
  const movedOn =
    queue.currentId !== null && queue.currentId !== (before.currentAfter ?? null) && entries.some((e) => e.id === queue.currentId);
  // A Stop point the change removed comes back too, unless another has been set since.
  const stopAfterId = queue.stopAfterId ?? before.stopAfterId ?? null;
  return { ...queue, entries, currentId: movedOn ? queue.currentId : before.currentId, stopAfterId };
}

/** Total seconds of known durations for the upcoming entries. */
export function remainingSeconds(queue: Queue): number {
  return upcoming(queue).reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
}

/**
 * Seconds until the queue finishes: what is left of the current video while it is on screen
 * (`positionSec` in), plus the upcoming entries. Unknown lengths count as zero.
 */
export function secondsLeft(queue: Queue, positionSec: number | null = null): number {
  const current = currentEntry(queue);
  const rest = remainingSeconds(queue);
  if (!current?.durationSec || !isCurrentPlaying(queue)) return rest;
  return rest + Math.max(0, current.durationSec - (positionSec ?? 0));
}

/** When the queue will finish (a timestamp), or null when nothing is left. */
export function endsAt(queue: Queue, positionSec: number | null = null, clock: Pick<Clock, 'now'> = systemClock): number | null {
  const seconds = secondsLeft(queue, positionSec);
  return seconds > 0 ? clock.now() + seconds * 1000 : null;
}
