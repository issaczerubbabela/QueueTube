// Persisted state layout and a read-only React view of it for UI surfaces.
import { useEffect, useState, useSyncExternalStore } from 'react';
import browser from 'webextension-polyfill';
import type { Progress, ProgressMap } from '../domain/progress';
import { DEFAULT_SETTINGS, EMPTY_QUEUE, Queue, Settings } from '../domain/queue';

export const KEYS = {
  queue: 'queue',
  settings: 'settings',
  undo: 'undo',
  lastSeenVersion: 'lastSeenVersion',
  /** Watch progress, kept apart from the queue so frequent position writes don't re-render it. */
  progress: 'progress',
} as const;

export function readQueue(raw: unknown): Queue {
  const q = (raw ?? {}) as Partial<Queue>;
  return {
    entries: Array.isArray(q.entries) ? q.entries : [],
    currentId: q.currentId ?? null,
    nowPlaying: q.nowPlaying ?? null,
    history: Array.isArray(q.history) ? q.history : EMPTY_QUEUE.history,
  };
}

export function readSettings(raw: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...((raw ?? {}) as Partial<Settings>) };
}

export function readLastSeenVersion(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

const isProgress = (p: unknown): p is Progress =>
  typeof p === 'object' && p !== null && typeof (p as Progress).position === 'number' && typeof (p as Progress).updatedAt === 'number';

/** Watch progress by video id; anything malformed (or missing, before 1.3) is dropped. */
export function readProgress(raw: unknown): ProgressMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const map: ProgressMap = {};
  for (const [videoId, p] of Object.entries(raw)) {
    if (!isProgress(p)) continue;
    map[videoId] = { position: p.position, duration: typeof p.duration === 'number' ? p.duration : null, watched: p.watched === true, updatedAt: p.updatedAt };
  }
  return map;
}

export interface ExtensionState {
  ready: boolean;
  queue: Queue;
  settings: Settings;
  /** The version whose What's new the user has seen; null after an update from before 1.2. */
  lastSeenVersion: string | null;
}

/** Live, read-only view of the queue, settings and last version seen. Changes go through `send()`. */
export function useExtensionState(): ExtensionState {
  const [state, setState] = useState<ExtensionState>({
    ready: false,
    queue: EMPTY_QUEUE,
    settings: DEFAULT_SETTINGS,
    lastSeenVersion: null,
  });

  useEffect(() => {
    let alive = true;
    browser.storage.local.get([KEYS.queue, KEYS.settings, KEYS.lastSeenVersion]).then((stored) => {
      if (!alive) return;
      setState({
        ready: true,
        queue: readQueue(stored[KEYS.queue]),
        settings: readSettings(stored[KEYS.settings]),
        lastSeenVersion: readLastSeenVersion(stored[KEYS.lastSeenVersion]),
      });
    });

    const onChanged = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      // Watch progress changes every few seconds; it has its own hook so the queue doesn't re-render.
      if (area !== 'local' || !(KEYS.queue in changes || KEYS.settings in changes || KEYS.lastSeenVersion in changes)) return;
      setState((prev) => ({
        ready: true,
        queue: KEYS.queue in changes ? readQueue(changes[KEYS.queue].newValue) : prev.queue,
        settings: KEYS.settings in changes ? readSettings(changes[KEYS.settings].newValue) : prev.settings,
        lastSeenVersion:
          KEYS.lastSeenVersion in changes ? readLastSeenVersion(changes[KEYS.lastSeenVersion].newValue) : prev.lastSeenVersion,
      }));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return state;
}

// ── Watch progress: one subscription per page, read per video ──────────────

let progressMap: ProgressMap = {};
const progressListeners = new Set<() => void>();
let progressStarted = false;

const sameProgress = (a: Progress | undefined, b: Progress) =>
  a !== undefined && a.position === b.position && a.duration === b.duration && a.watched === b.watched;

function updateProgress(next: ProgressMap) {
  // Keep unchanged records as the same objects, so only the bars whose video moved re-render.
  const merged: ProgressMap = {};
  for (const [videoId, p] of Object.entries(next)) merged[videoId] = sameProgress(progressMap[videoId], p) ? progressMap[videoId] : p;
  progressMap = merged;
  progressListeners.forEach((listener) => listener());
}

function subscribeProgress(listener: () => void) {
  if (!progressStarted) {
    progressStarted = true;
    browser.storage.local.get(KEYS.progress).then((stored) => updateProgress(readProgress(stored[KEYS.progress])));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && KEYS.progress in changes) updateProgress(readProgress(changes[KEYS.progress].newValue));
    });
  }
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

/**
 * Live, read-only Watch progress for one video. Position writes re-render only the components
 * reading the video that moved, never the whole queue.
 */
export function useWatchProgress(videoId: string): Progress | undefined {
  return useSyncExternalStore(subscribeProgress, () => progressMap[videoId]);
}
