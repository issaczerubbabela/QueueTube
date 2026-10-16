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
}

export interface Settings {
  autoQueue: boolean;
  allowDuplicates: boolean;
  removeAfterPlaying: boolean;
  focusPlayerAfterQueueing: boolean;
  autoAdvance: boolean;
  lookUpDurations: boolean;
  sidebarCollapsed: boolean;
}

export const EMPTY_QUEUE: Queue = { entries: [], currentId: null, nowPlaying: null, history: [] };

export const DEFAULT_SETTINGS: Settings = {
  autoQueue: true,
  allowDuplicates: false,
  removeAfterPlaying: false,
  focusPlayerAfterQueueing: true,
  autoAdvance: true,
  lookUpDurations: true,
  sidebarCollapsed: false,
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

// ── Queries ──────────────────────────────────────────────────────────────────

export function currentIndex(queue: Queue): number {
  return queue.currentId === null ? -1 : queue.entries.findIndex((e) => e.id === queue.currentId);
}

export function currentEntry(queue: Queue): Entry | null {
  return queue.entries[currentIndex(queue)] ?? null;
}

/** The entry "next" would play. */
export function nextEntry(queue: Queue): Entry | null {
  return queue.entries[currentIndex(queue) + 1] ?? null;
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

export function enqueue(
  queue: Queue,
  videos: Video[],
  settings: Pick<Settings, 'allowDuplicates'>,
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
  return { ...queue, entries: [...queue.entries, ...added] };
}

export function remove(queue: Queue, entryId: string): Queue {
  const index = queue.entries.findIndex((e) => e.id === entryId);
  if (index < 0) return queue;
  const entries = queue.entries.filter((e) => e.id !== entryId);
  // Removing the current entry leaves the cursor just before the entry that followed it,
  // so "next" still plays that one.
  const currentId =
    queue.currentId === entryId ? (entries[index - 1]?.id ?? null) : queue.currentId;
  return { ...queue, entries, currentId };
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
  return { ...queue, entries: [], currentId: null };
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

/** Moves to the entry after the current one. At the end of the queue nothing plays. */
export function advance(queue: Queue, settings: Settings, clock: Clock = systemClock): Step {
  const current = currentEntry(queue);
  const next = nextEntry(queue);
  if (!next) {
    if (!current || !settings.removeAfterPlaying) return stay(queue);
    // The last entry finished: it leaves the queue, and nothing else plays.
    return stay({
      ...queue,
      entries: queue.entries.filter((e) => e.id !== current.id),
      history: recordHistory(queue.history, current, clock.now()),
      currentId: null,
    });
  }

  let entries = queue.entries;
  let history = queue.history;
  if (current) {
    history = recordHistory(history, current, clock.now());
    if (settings.removeAfterPlaying) entries = entries.filter((e) => e.id !== current.id);
  }
  return { queue: { ...queue, entries, history, currentId: next.id }, play: next.videoId };
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

/**
 * Undoes a remove or clear: brings back the entries from `before` in their old order, keeps
 * anything added since, and restores the old current entry if nothing newer is current.
 */
export function restore(queue: Queue, before: Pick<Queue, 'entries' | 'currentId'>): Queue {
  const known = new Set(before.entries.map((e) => e.id));
  const addedSince = queue.entries.filter((e) => !known.has(e.id));
  const entries = [...before.entries, ...addedSince];
  const currentStillThere = queue.currentId !== null && entries.some((e) => e.id === queue.currentId);
  return { ...queue, entries, currentId: currentStillThere ? queue.currentId : before.currentId };
}

/** Total seconds of known durations for the upcoming entries. */
export function remainingSeconds(queue: Queue): number {
  return upcoming(queue).reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
}
