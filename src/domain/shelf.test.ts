import { describe as group, expect, it } from 'vitest';
import { Clock, DEFAULT_SETTINGS, EMPTY_QUEUE, Queue, Video, currentEntry, enqueue, setStopPoint } from './queue';
import { EMPTY_SHELF, Shelf, backToQueue, describeShelved, moveOnShelf, moveToShelf, removeFromShelf, withoutQueued } from './shelf';

function fakeClock(): Clock {
  let n = 0;
  return { now: () => 1000 + n, newId: () => `id${++n}` };
}
const video = (videoId: string): Video => ({ videoId, title: `Title ${videoId}`, channel: 'Channel', durationSec: 60 });
function queueOf(ids: string[], current: number | null = null): Queue {
  const q = enqueue(EMPTY_QUEUE, ids.map(video), { allowDuplicates: true }, 'end', fakeClock());
  return { ...q, currentId: current === null ? null : q.entries[current].id };
}
const shelfOf = (ids: string[]): Shelf => ids.map((id, i) => ({ ...video(id), shelvedAt: i }));
const ids = (q: Queue) => q.entries.map((e) => e.videoId);
const shelved = (s: Shelf) => s.map((v) => v.videoId);
const settings = { ...DEFAULT_SETTINGS };

group('moveToShelf', () => {
  it('takes the entry out of the Queue and puts its video at the end of the Shelf', () => {
    const { queue, shelf } = moveToShelf(queueOf(['a', 'b', 'c'], 0), shelfOf(['x']), 'id2', { now: () => 5 });
    expect(ids(queue)).toEqual(['a', 'c']);
    expect(shelved(shelf)).toEqual(['x', 'b']);
    expect(shelf[1]).toEqual({ ...video('b'), shelvedAt: 5 });
  });

  it('moving the current entry leaves next pointing at the entry after it', () => {
    const { queue } = moveToShelf(queueOf(['a', 'b', 'c'], 1), EMPTY_SHELF, 'id2');
    expect(currentEntry(queue)?.videoId).toBe('a');
  });

  it('takes every entry for the video, so it is never in both places', () => {
    const { queue, shelf } = moveToShelf(queueOf(['a', 'b', 'a']), EMPTY_SHELF, 'id1');
    expect(ids(queue)).toEqual(['b']);
    expect(shelved(shelf)).toEqual(['a']);
  });

  it('clears a Stop point on that entry', () => {
    const { queue } = moveToShelf(setStopPoint(queueOf(['a', 'b']), 'id2'), EMPTY_SHELF, 'id2');
    expect(queue.stopAfterId).toBeNull();
  });

  it('does nothing for an unknown entry', () => {
    const q = queueOf(['a']);
    expect(moveToShelf(q, EMPTY_SHELF, 'nope')).toEqual({ queue: q, shelf: EMPTY_SHELF });
  });
});

group('backToQueue', () => {
  it('moves a video back to the end of the Queue', () => {
    const { queue, shelf } = backToQueue(queueOf(['a', 'b'], 0), shelfOf(['x', 'y']), 'x', settings, 'end', fakeClock());
    expect(ids(queue)).toEqual(['a', 'b', 'x']);
    expect(shelved(shelf)).toEqual(['y']);
    expect(queue.entries[2]).toMatchObject(video('x'));
  });

  it('moves a video back as Play next', () => {
    const { queue } = backToQueue(queueOf(['a', 'b', 'c'], 0), shelfOf(['x']), 'x', settings, 'next', fakeClock());
    expect(ids(queue)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('does nothing for a video not on the Shelf', () => {
    const q = queueOf(['a']);
    const s = shelfOf(['x']);
    expect(backToQueue(q, s, 'nope', settings)).toEqual({ queue: q, shelf: s });
  });
});

group('withoutQueued', () => {
  it('queueing a shelved video, by any route, takes it off the Shelf', () => {
    const queue = enqueue(queueOf(['a']), [video('y')], settings);
    expect(shelved(withoutQueued(shelfOf(['x', 'y', 'z']), queue))).toEqual(['x', 'z']);
  });

  it('returns the same Shelf when nothing on it is queued', () => {
    const s = shelfOf(['x']);
    expect(withoutQueued(s, queueOf(['a']))).toBe(s);
  });
});

group('reorder, remove and describe on the Shelf', () => {
  it('moves a video to a new place', () => {
    expect(shelved(moveOnShelf(shelfOf(['x', 'y', 'z']), 'z', 0))).toEqual(['z', 'x', 'y']);
  });

  it('removes a video', () => {
    expect(shelved(removeFromShelf(shelfOf(['x', 'y']), 'x'))).toEqual(['y']);
  });

  it('fills in details that arrive later', () => {
    const s: Shelf = [{ videoId: 'x', title: '', channel: '', durationSec: null, shelvedAt: 0 }];
    expect(describeShelved(s, 'x', { title: 'T', durationSec: 9 })[0]).toMatchObject({ title: 'T', durationSec: 9 });
    expect(describeShelved(s, 'y', { title: 'T' })).toBe(s);
  });
});
