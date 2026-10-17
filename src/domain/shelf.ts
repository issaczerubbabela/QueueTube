// The Shelf: videos set aside outside the Queue (CONTEXT.md). Nothing on it plays by itself; it
// has no current entry, no undo and no History. A video is on the Shelf or in the Queue, never
// both: moving between them is the only way across, and queueing a shelved video by any route
// takes it off the Shelf. Pure functions, in the style of the queue model.
import { Clock, Position, Queue, Settings, Video, enqueue, remove, systemClock } from './queue';

export interface ShelfItem extends Video {
  shelvedAt: number;
}

export type Shelf = ShelfItem[];

export const EMPTY_SHELF: Shelf = [];

/** Moves an entry's video from the Queue to the end of the Shelf (every entry for that video, if duplicated). */
export function moveToShelf(queue: Queue, shelf: Shelf, entryId: string, clock: Pick<Clock, 'now'> = systemClock): { queue: Queue; shelf: Shelf } {
  const entry = queue.entries.find((e) => e.id === entryId);
  if (!entry) return { queue, shelf };
  const nextQueue = queue.entries.filter((e) => e.videoId === entry.videoId).reduce((q, e) => remove(q, e.id), queue);
  const { videoId, title, channel, durationSec } = entry;
  const nextShelf = [...shelf.filter((s) => s.videoId !== videoId), { videoId, title, channel, durationSec, shelvedAt: clock.now() }];
  return { queue: nextQueue, shelf: nextShelf };
}

/** Moves a video from the Shelf back into the Queue: at the end, as Play next, or at an index. */
export function backToQueue(
  queue: Queue,
  shelf: Shelf,
  videoId: string,
  settings: Pick<Settings, 'allowDuplicates'>,
  at: Position = 'end',
  clock: Clock = systemClock
): { queue: Queue; shelf: Shelf } {
  const item = shelf.find((s) => s.videoId === videoId);
  if (!item) return { queue, shelf };
  const { shelvedAt: _shelvedAt, ...video } = item;
  return { queue: enqueue(queue, [video], settings, at, clock), shelf: shelf.filter((s) => s.videoId !== videoId) };
}

/** Takes every video that is now in the Queue off the Shelf. Returns the same Shelf if none was. */
export function withoutQueued(shelf: Shelf, queue: Queue): Shelf {
  const queued = new Set(queue.entries.map((e) => e.videoId));
  return shelf.some((s) => queued.has(s.videoId)) ? shelf.filter((s) => !queued.has(s.videoId)) : shelf;
}

/** Moves a shelved video so it ends up at `toIndex`. */
export function moveOnShelf(shelf: Shelf, videoId: string, toIndex: number): Shelf {
  const from = shelf.findIndex((s) => s.videoId === videoId);
  if (from < 0) return shelf;
  const to = Math.max(0, Math.min(toIndex, shelf.length - 1));
  if (from === to) return shelf;
  const next = [...shelf];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removeFromShelf(shelf: Shelf, videoId: string): Shelf {
  return shelf.some((s) => s.videoId === videoId) ? shelf.filter((s) => s.videoId !== videoId) : shelf;
}

/** Fills in details for a shelved video, as `describe` does for the queue. */
export function describeShelved(shelf: Shelf, videoId: string, details: Partial<Video>): Shelf {
  const known = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== '' && v != null)) as Partial<Video>;
  let changed = false;
  const next = shelf.map((s) => {
    if (s.videoId !== videoId) return s;
    const updated = { ...s, ...known };
    if (updated.title !== s.title || updated.channel !== s.channel || updated.durationSec !== s.durationSec) changed = true;
    return updated;
  });
  return changed ? next : shelf;
}
