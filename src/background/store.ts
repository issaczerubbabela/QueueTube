// Persistence for the background worker, the only writer of queue state (ADR 0001).
// Every read-modify-write runs inside `serial`, so tab events and commands never interleave.
import browser from 'webextension-polyfill';
import type { ProgressMap } from '../domain/progress';
import { DEFAULT_SETTINGS, Entry, Queue, Settings, UndoSnapshot, upcoming } from '../domain/queue';
import { KEYS, readProgress, readQueue, readSettings } from '../shared/state';

let tail: Promise<unknown> = Promise.resolve();

/** Runs jobs one at a time, in call order. A job must never await another `serial` job. */
export function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch((err) => console.error('[Cue]', err));
  return run;
}

export async function loadQueue(): Promise<Queue> {
  const stored = await browser.storage.local.get(KEYS.queue);
  return readQueue(stored[KEYS.queue]);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEYS.settings);
  return readSettings(stored[KEYS.settings]);
}

export async function saveQueue(queue: Queue): Promise<void> {
  await browser.storage.local.set({ [KEYS.queue]: queue });
  const count = upcoming(queue).length;
  await browser.action?.setBadgeText({ text: count > 0 ? String(count) : '' });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEYS.settings]: settings });
}

export async function loadProgress(): Promise<ProgressMap> {
  const stored = await browser.storage.local.get(KEYS.progress);
  return readProgress(stored[KEYS.progress]);
}

export async function saveProgress(progress: ProgressMap): Promise<void> {
  await browser.storage.local.set({ [KEYS.progress]: progress });
}

export async function saveLastSeenVersion(version: string): Promise<void> {
  await browser.storage.local.set({ [KEYS.lastSeenVersion]: version });
}

// ── Session state: forgotten when the browser restarts, kept while the worker sleeps ──

export interface TabBook {
  playerTabId: number | null;
  /** Tabs opened while Cue was running that have not landed on a page yet. */
  fresh: number[];
  /** Tabs the user opened outside Cue on purpose; never auto-queued or gathered. */
  free: number[];
  /** When the browser started (0 if Cue was installed mid-session); tabs created right after are session restore. */
  bootAt: number;
}

const BOOK_KEY = 'tabBook';

export async function loadBook(): Promise<TabBook> {
  const stored = await browser.storage.session.get(BOOK_KEY);
  const book = stored[BOOK_KEY] as TabBook | undefined;
  if (book) return book;
  const fresh: TabBook = { playerTabId: null, fresh: [], free: [], bootAt: 0 };
  await browser.storage.session.set({ [BOOK_KEY]: fresh });
  return fresh;
}

/** Drops a tab from the fresh and free lists (it closed, settled, or became the player). */
export function forgetTab(book: TabBook, tabId: number): void {
  book.fresh = book.fresh.filter((id) => id !== tabId);
  book.free = book.free.filter((id) => id !== tabId);
}

export async function saveBook(book: TabBook): Promise<void> {
  await browser.storage.session.set({ [BOOK_KEY]: book });
}

export async function saveUndo(snapshot: UndoSnapshot | null): Promise<void> {
  if (snapshot) await browser.storage.session.set({ [KEYS.undo]: snapshot });
  else await browser.storage.session.remove(KEYS.undo);
}

export async function loadUndo(): Promise<UndoSnapshot | null> {
  const stored = await browser.storage.session.get(KEYS.undo);
  return (stored[KEYS.undo] as UndoSnapshot | undefined) ?? null;
}

// ── Migration from the 1.0 storage layout (`queueState`) ──

interface LegacyState {
  queue?: { id: string; videoId: string; title?: string; channel?: string; addedAt?: number }[];
  currentVideoId?: string | null;
  history?: { videoId: string; title?: string; channel?: string; addedAt?: number }[];
  settings?: { autoGather?: boolean; allowDuplicates?: boolean; autoRemovePlayed?: boolean; autoFocusPlayer?: boolean; sidebarCollapsed?: boolean };
}

const cleanTitle = (title?: string) => (title && !/^(YouTube )?Video \(/.test(title) ? title : '');
const cleanChannel = (channel?: string) => (channel && channel !== 'YouTube Channel' && channel !== 'YouTube' ? channel : '');

export async function migrateLegacyState(): Promise<void> {
  const stored = await browser.storage.local.get('queueState');
  const legacy = stored.queueState as LegacyState | undefined;
  if (!legacy) return;

  const entries: Entry[] = (legacy.queue ?? []).map((item) => ({
    id: item.id,
    videoId: item.videoId,
    title: cleanTitle(item.title),
    channel: cleanChannel(item.channel),
    durationSec: null,
    addedAt: item.addedAt ?? Date.now(),
  }));
  const queue: Queue = {
    entries,
    currentId: entries.find((e) => e.videoId === legacy.currentVideoId)?.id ?? null,
    nowPlaying: null,
    history: (legacy.history ?? []).map((item) => ({
      videoId: item.videoId,
      title: cleanTitle(item.title),
      channel: cleanChannel(item.channel),
      durationSec: null,
      playedAt: item.addedAt ?? Date.now(),
    })),
  };
  const old = legacy.settings ?? {};
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    autoQueue: old.autoGather ?? DEFAULT_SETTINGS.autoQueue,
    allowDuplicates: old.allowDuplicates ?? DEFAULT_SETTINGS.allowDuplicates,
    removeAfterPlaying: old.autoRemovePlayed ?? DEFAULT_SETTINGS.removeAfterPlaying,
    focusPlayerAfterQueueing: old.autoFocusPlayer ?? DEFAULT_SETTINGS.focusPlayerAfterQueueing,
    sidebarCollapsed: old.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
  };
  await saveQueue(queue);
  await saveSettings(settings);
  await browser.storage.local.remove('queueState');
}
