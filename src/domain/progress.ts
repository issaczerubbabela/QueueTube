// Watch progress: how far into each video the user has got. It belongs to the video, not to an
// Entry, so the same video resumes from the same point wherever it shows up (CONTEXT.md). Pure
// functions over a plain map, in the same style as the queue model.
import { Clock, systemClock } from './queue';

export interface Progress {
  /** Seconds in. 0 for a Watched video, which starts again from the beginning. */
  position: number;
  /** The video's length in seconds, or null while it isn't known. */
  duration: number | null;
  watched: boolean;
  updatedAt: number;
}

/** Watch progress by video id. */
export type ProgressMap = Record<string, Progress>;

/** Anything less than this far in leaves no resume point. */
export const RESUME_AFTER_SEC = 30;
/** A video counts as Watched once this much of it has played. */
export const WATCHED_FRACTION = 0.9;
/** Only the most recently updated videos keep their Watch progress. */
export const PROGRESS_LIMIT = 500;

export const EMPTY_PROGRESS: ProgressMap = {};

const NONE: ReadonlySet<string> = new Set();

function reachesWatched(position: number, duration: number | null): boolean {
  return duration !== null && duration > 0 && position >= duration * WATCHED_FRACTION;
}

/** Stores `progress` for a video, dropping the least recently updated videos beyond the limit. */
function put(map: ProgressMap, videoId: string, progress: Progress): ProgressMap {
  const next = { ...map, [videoId]: progress };
  const ids = Object.keys(next);
  if (ids.length <= PROGRESS_LIMIT) return next;
  const keep = ids.sort((a, b) => next[b].updatedAt - next[a].updatedAt).slice(0, PROGRESS_LIMIT);
  return Object.fromEntries(keep.map((id) => [id, next[id]]));
}

function without(map: ProgressMap, videoId: string): ProgressMap {
  if (!(videoId in map)) return map;
  const { [videoId]: _gone, ...rest } = map;
  return rest;
}

const positive = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);

/**
 * The player reports how far into a video it is. Progress is kept only between
 * RESUME_AFTER_SEC and the Watched mark; reaching the mark makes the video Watched and clears
 * its resume point.
 */
export function recordPosition(
  map: ProgressMap,
  videoId: string,
  position: number,
  duration: number | null,
  clock: Pick<Clock, 'now'> = systemClock
): ProgressMap {
  const known = map[videoId];
  const length = positive(duration) ?? known?.duration ?? null;
  if (reachesWatched(position, length)) return markWatched(map, videoId, length, clock);
  if (position < RESUME_AFTER_SEC) {
    // Rewatching a Watched video from the start keeps it Watched until it gets somewhere.
    return known?.watched ? map : without(map, videoId);
  }
  return put(map, videoId, { position: Math.floor(position), duration: length, watched: false, updatedAt: clock.now() });
}

/** The video ended (or reached the Watched mark): it is Watched and starts from the beginning next time. */
export function markWatched(
  map: ProgressMap,
  videoId: string,
  duration: number | null = null,
  clock: Pick<Clock, 'now'> = systemClock
): ProgressMap {
  const length = positive(duration) ?? map[videoId]?.duration ?? null;
  return put(map, videoId, { position: 0, duration: length, watched: true, updatedAt: clock.now() });
}

/** A link asked to start a video at `start` seconds (`t=`): that replaces its saved progress. */
export function setStart(
  map: ProgressMap,
  videoId: string,
  start: number,
  clock: Pick<Clock, 'now'> = systemClock
): ProgressMap {
  if (!positive(start)) return map;
  return put(map, videoId, { position: Math.floor(start), duration: map[videoId]?.duration ?? null, watched: false, updatedAt: clock.now() });
}

/** Applies the start times of several incoming links. */
export function setStarts(map: ProgressMap, starts: Record<string, number> | undefined, clock: Pick<Clock, 'now'> = systemClock): ProgressMap {
  return Object.entries(starts ?? {}).reduce((m, [videoId, start]) => setStart(m, videoId, start, clock), map);
}

/** Where playing `videoId` should start, or null for the beginning. */
export function resumeAt(map: ProgressMap, videoId: string): number | null {
  const known = map[videoId];
  return known && !known.watched && known.position > 0 ? known.position : null;
}

export function isWatched(map: ProgressMap, videoId: string): boolean {
  return map[videoId]?.watched === true;
}

/** Every Watched video. */
export function watchedVideos(map: ProgressMap): ReadonlySet<string> {
  const ids = Object.keys(map).filter((id) => map[id].watched);
  return ids.length ? new Set(ids) : NONE;
}

/**
 * How much of a video has been watched, from 0 to 1, for a progress bar. A Watched video is 1.
 * `fallbackDuration` covers progress saved before the video's length was known.
 */
export function watchedFraction(progress: Progress | undefined, fallbackDuration: number | null = null): number {
  if (!progress) return 0;
  if (progress.watched) return 1;
  const length = progress.duration ?? positive(fallbackDuration);
  return length ? Math.min(1, Math.max(0, progress.position / length)) : 0;
}
