import { describe as group, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  EMPTY_QUEUE,
  Clock,
  Queue,
  Settings,
  Video,
  advance,
  canGoBack,
  clear,
  currentEntry,
  describe,
  enqueue,
  goBack,
  isCurrentPlaying,
  jumpTo,
  move,
  playNextInLine,
  playerShowing,
  remainingSeconds,
  remove,
  restore,
  upcoming,
} from './queue';

function fakeClock(): Clock {
  let n = 0;
  return { now: () => 1000 + n, newId: () => `id${++n}` };
}

const video = (videoId: string, durationSec: number | null = null): Video => ({
  videoId,
  title: `Title ${videoId}`,
  channel: 'Channel',
  durationSec,
});

const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides });

function queueOf(ids: string[], current: number | null = null): Queue {
  const queue = enqueue(EMPTY_QUEUE, ids.map((id) => video(id)), { allowDuplicates: true }, fakeClock());
  return { ...queue, currentId: current === null ? null : queue.entries[current].id };
}

const ids = (queue: Queue) => queue.entries.map((e) => e.videoId);

group('enqueue', () => {
  it('skips videos already queued unless duplicates are allowed', () => {
    const q = queueOf(['a', 'b']);
    expect(ids(enqueue(q, [video('a'), video('c')], { allowDuplicates: false }))).toEqual(['a', 'b', 'c']);
    expect(ids(enqueue(q, [video('a')], { allowDuplicates: true }))).toEqual(['a', 'b', 'a']);
  });

  it('dedupes within a single batch', () => {
    expect(ids(enqueue(EMPTY_QUEUE, [video('a'), video('a')], { allowDuplicates: false }))).toEqual(['a']);
  });

  it('returns the same queue when nothing is added', () => {
    const q = queueOf(['a']);
    expect(enqueue(q, [video('a')], { allowDuplicates: false })).toBe(q);
  });
});

group('advance', () => {
  it('plays the entry after the current one and records history', () => {
    const step = advance(queueOf(['a', 'b', 'c'], 0), settings(), fakeClock());
    expect(step.play).toBe('b');
    expect(currentEntry(step.queue)?.videoId).toBe('b');
    expect(step.queue.history.map((h) => h.videoId)).toEqual(['a']);
    expect(ids(step.queue)).toEqual(['a', 'b', 'c']);
  });

  it('starts from the top when nothing is current', () => {
    expect(advance(queueOf(['a', 'b']), settings()).play).toBe('a');
  });

  it('does not wrap around at the end of the queue', () => {
    const q = queueOf(['a', 'b'], 1);
    const step = advance(q, settings());
    expect(step.play).toBeNull();
    expect(step.queue).toBe(q);
  });

  it('removes the finished entry when removeAfterPlaying is on', () => {
    const step = advance(queueOf(['a', 'b'], 0), settings({ removeAfterPlaying: true }));
    expect(ids(step.queue)).toEqual(['b']);
    expect(step.play).toBe('b');
  });

  it('removes the last entry without playing anything when removeAfterPlaying is on', () => {
    const step = advance(queueOf(['a'], 0), settings({ removeAfterPlaying: true }));
    expect(ids(step.queue)).toEqual([]);
    expect(step.queue.currentId).toBeNull();
    expect(step.play).toBeNull();
    expect(step.queue.history.map((h) => h.videoId)).toEqual(['a']);
  });

  it('tells duplicate entries of the same video apart', () => {
    const step = advance(queueOf(['a', 'a', 'b'], 0), settings());
    expect(step.queue.currentId).toBe('id2');
  });
});

group('goBack', () => {
  it('moves to the previous entry when played entries are kept', () => {
    const step = goBack(queueOf(['a', 'b'], 1), settings());
    expect(step.play).toBe('a');
    expect(currentEntry(step.queue)?.videoId).toBe('a');
  });

  it('brings the last history item back to the front in remove-after-playing mode', () => {
    const s = settings({ removeAfterPlaying: true });
    const played = advance(queueOf(['a', 'b'], 0), s).queue;
    const step = goBack(played, s, fakeClock());
    expect(step.play).toBe('a');
    expect(ids(step.queue)).toEqual(['a', 'b']);
    expect(currentEntry(step.queue)?.videoId).toBe('a');
    expect(step.queue.history).toEqual([]);
  });

  it('reports whether going back is possible', () => {
    expect(canGoBack(queueOf(['a', 'b'], 0), settings())).toBe(false);
    expect(canGoBack(queueOf(['a', 'b'], 1), settings())).toBe(true);
  });
});

group('remove', () => {
  it('keeps "next" pointing at the following entry when the current entry is removed', () => {
    const q = remove(queueOf(['a', 'b', 'c'], 1), 'id2');
    expect(ids(q)).toEqual(['a', 'c']);
    expect(advance(q, settings()).play).toBe('c');
  });

  it('removing the first, current entry leaves nothing current', () => {
    const q = remove(queueOf(['a', 'b'], 0), 'id1');
    expect(q.currentId).toBeNull();
    expect(advance(q, settings()).play).toBe('b');
  });
});

group('move', () => {
  it('moves an entry to the target index, clamped to the list', () => {
    expect(ids(move(queueOf(['a', 'b', 'c']), 'id1', 2))).toEqual(['b', 'c', 'a']);
    expect(ids(move(queueOf(['a', 'b', 'c']), 'id3', -5))).toEqual(['c', 'a', 'b']);
  });

  it('playNextInLine puts an entry right after the current one', () => {
    expect(ids(playNextInLine(queueOf(['a', 'b', 'c', 'd'], 0), 'id4'))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(playNextInLine(queueOf(['a', 'b', 'c', 'd'], 2), 'id1'))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(playNextInLine(queueOf(['a', 'b']), 'id2'))).toEqual(['b', 'a']);
  });
});

group('playerShowing', () => {
  it('follows the player onto a queued video', () => {
    const q = playerShowing(queueOf(['a', 'b', 'c'], 0), 'c');
    expect(currentEntry(q)?.videoId).toBe('c');
    expect(isCurrentPlaying(q)).toBe(true);
  });

  it('keeps the current entry when the player wanders off the queue', () => {
    const q = playerShowing(queueOf(['a', 'b'], 0), 'zzz');
    expect(currentEntry(q)?.videoId).toBe('a');
    expect(q.nowPlaying).toBe('zzz');
    expect(isCurrentPlaying(q)).toBe(false);
    expect(advance(q, settings()).play).toBe('b');
  });

  it('prefers the next occurrence of a duplicated video', () => {
    const q = playerShowing(queueOf(['a', 'b', 'a'], 1), 'a');
    expect(q.currentId).toBe('id3');
  });
});

group('jumpTo / clear', () => {
  it('jumps to an entry and asks the player to load it', () => {
    const step = jumpTo(queueOf(['a', 'b']), 'id2');
    expect(step.play).toBe('b');
    expect(step.queue.currentId).toBe('id2');
  });

  it('clear empties the queue but keeps history', () => {
    const q = advance(queueOf(['a', 'b'], 0), settings()).queue;
    const cleared = clear(q);
    expect(cleared.entries).toEqual([]);
    expect(cleared.history).toHaveLength(1);
  });
});

group('describe', () => {
  it('fills in details for matching entries and ignores blanks', () => {
    const q = describe(queueOf(['a', 'b']), 'a', { title: 'Real', durationSec: 61, channel: '' });
    expect(q.entries[0]).toMatchObject({ title: 'Real', durationSec: 61, channel: 'Channel' });
    expect(q.entries[1].title).toBe('Title b');
  });

  it('returns the same queue when nothing changes', () => {
    const q = queueOf(['a']);
    expect(describe(q, 'a', { title: 'Title a' })).toBe(q);
  });
});

group('upcoming / remainingSeconds', () => {
  it('counts only entries after the current one', () => {
    const q = enqueue(EMPTY_QUEUE, [video('a', 60), video('b', 30), video('c', null)], { allowDuplicates: false });
    const positioned = { ...q, currentId: q.entries[0].id };
    expect(upcoming(positioned).map((e) => e.videoId)).toEqual(['b', 'c']);
    expect(remainingSeconds(positioned)).toBe(30);
  });
});

group('restore', () => {
  it('brings removed entries back without losing ones added since', () => {
    const before = queueOf(['a', 'b', 'c'], 0);
    const later = enqueue(remove(before, 'id2'), [video('d')], { allowDuplicates: false }, { now: () => 0, newId: () => 'new' });
    const undone = restore(later, before);
    expect(ids(undone)).toEqual(['a', 'b', 'c', 'd']);
    expect(undone.currentId).toBe('id1');
  });

  it('restores the old current entry after a clear', () => {
    const before = queueOf(['a', 'b'], 1);
    expect(restore(clear(before), before).currentId).toBe('id2');
  });
});
