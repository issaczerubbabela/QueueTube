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
  clearWatched,
  currentEntry,
  describe,
  endsAt,
  enqueue,
  goBack,
  isCurrentPlaying,
  jumpTo,
  matchesFilter,
  move,
  nextEntry,
  playNextInLine,
  playerShowing,
  remainingSeconds,
  remove,
  restore,
  secondsLeft,
  setStopPoint,
  shuffleUpcoming,
  sortUpcoming,
  stopsHere,
  upcoming,
  videoEnded,
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
  const queue = enqueue(EMPTY_QUEUE, ids.map((id) => video(id)), { allowDuplicates: true }, 'end', fakeClock());
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

  it('adds to the end by default', () => {
    expect(ids(enqueue(queueOf(['a', 'b'], 0), [video('c'), video('d')], settings(), 'end'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('adds Play next right after the current entry, in order', () => {
    const q = enqueue(queueOf(['a', 'b', 'c'], 1), [video('x'), video('y')], settings(), 'next');
    expect(ids(q)).toEqual(['a', 'b', 'x', 'y', 'c']);
    expect(currentEntry(q)?.videoId).toBe('b');
  });

  it('adds Play next to the top when nothing is current, so next plays it', () => {
    const q = enqueue(queueOf(['a', 'b']), [video('x')], settings(), 'next');
    expect(ids(q)).toEqual(['x', 'a', 'b']);
    expect(advance(q, settings()).play).toBe('x');
  });

  it('adds Play next after the current entry even while the player is elsewhere', () => {
    const q = enqueue(playerShowing(queueOf(['a', 'b'], 0), 'zzz'), [video('x')], settings(), 'next');
    expect(ids(q)).toEqual(['a', 'x', 'b']);
  });

  it('adds at an index, clamped to the queue', () => {
    expect(ids(enqueue(queueOf(['a', 'b', 'c']), [video('x')], settings(), 1))).toEqual(['a', 'x', 'b', 'c']);
    expect(ids(enqueue(queueOf(['a']), [video('x')], settings(), 99))).toEqual(['a', 'x']);
    expect(ids(enqueue(queueOf(['a']), [video('x')], settings(), -3))).toEqual(['x', 'a']);
  });

  it('respects Allow duplicates wherever it adds', () => {
    const q = queueOf(['a', 'b', 'c'], 0);
    const off = settings({ allowDuplicates: false });
    const on = settings({ allowDuplicates: true });
    expect(ids(enqueue(q, [video('c'), video('x')], off, 'next'))).toEqual(['a', 'x', 'b', 'c']);
    expect(ids(enqueue(q, [video('c')], on, 'next'))).toEqual(['a', 'c', 'b', 'c']);
    expect(enqueue(q, [video('b')], off, 0)).toBe(q);
    expect(ids(enqueue(q, [video('b')], on, 0))).toEqual(['b', 'a', 'b', 'c']);
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
    const later = enqueue(remove(before, 'id2'), [video('d')], { allowDuplicates: false }, 'end', { now: () => 0, newId: () => 'new' });
    const undone = restore(later, before);
    expect(ids(undone)).toEqual(['a', 'b', 'c', 'd']);
    expect(undone.currentId).toBe('id1');
  });

  it('restores the old current entry after a clear', () => {
    const before = queueOf(['a', 'b'], 1);
    expect(restore(clear(before), before).currentId).toBe('id2');
  });

  it('restores a removed current entry as current', () => {
    const before = queueOf(['a', 'b', 'c'], 1);
    const after = remove(before, 'id2');
    expect(restore(after, { ...before, currentAfter: after.currentId })).toEqual(before);
  });

  it('keeps the current entry when the queue has moved on since', () => {
    const before = queueOf(['a', 'b', 'c'], 1);
    const after = remove(before, 'id2');
    const moved = advance(after, settings()).queue;
    expect(restore(moved, { ...before, currentAfter: after.currentId }).currentId).toBe(moved.currentId);
  });
});

group('Skip watched', () => {
  const watched = new Set(['b', 'c']);

  it('is off by default, so Advance plays Watched entries', () => {
    expect(DEFAULT_SETTINGS.skipWatched).toBe(false);
    expect(advance(queueOf(['a', 'b', 'c', 'd'], 0), settings(), fakeClock(), watched).play).toBe('b');
  });

  it('passes over Watched entries when on, and keeps them in the queue', () => {
    const { queue, play } = advance(queueOf(['a', 'b', 'c', 'd'], 0), settings({ skipWatched: true }), fakeClock(), watched);
    expect(play).toBe('d');
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'd']);
    expect(currentEntry(queue)?.videoId).toBe('d');
  });

  it('records only the entry it moved past in History', () => {
    const { queue } = advance(queueOf(['a', 'b', 'c', 'd'], 0), settings({ skipWatched: true }), fakeClock(), watched);
    expect(queue.history.map((h) => h.videoId)).toEqual(['a']);
  });

  it('with Remove after playing, removes only the entry it moved past', () => {
    const { queue } = advance(queueOf(['a', 'b', 'c', 'd'], 0), settings({ skipWatched: true, removeAfterPlaying: true }), fakeClock(), watched);
    expect(ids(queue)).toEqual(['b', 'c', 'd']);
  });

  it('stays put when everything after the current entry is Watched', () => {
    const q = queueOf(['a', 'b', 'c'], 0);
    expect(advance(q, settings({ skipWatched: true }), fakeClock(), watched)).toEqual({ queue: q, play: null });
  });

  it('starts at the first unwatched entry when nothing is current', () => {
    expect(advance(queueOf(['b', 'c', 'd']), settings({ skipWatched: true }), fakeClock(), watched).play).toBe('d');
  });

  it('nextEntry agrees with Advance', () => {
    const q = queueOf(['a', 'b', 'c', 'd'], 0);
    expect(nextEntry(q, watched)?.videoId).toBe('d');
    expect(nextEntry(q)?.videoId).toBe('b');
  });
});

group('clearWatched', () => {
  const watched = new Set(['b', 'd']);

  it('removes only Watched entries', () => {
    expect(ids(clearWatched(queueOf(['a', 'b', 'c', 'd']), watched))).toEqual(['a', 'c']);
  });

  it('returns the same queue when nothing is Watched', () => {
    const q = queueOf(['a', 'c']);
    expect(clearWatched(q, watched)).toBe(q);
  });

  it('keeps the current entry when it is not Watched', () => {
    const q = clearWatched(queueOf(['a', 'b', 'c', 'd'], 2), watched);
    expect(currentEntry(q)?.videoId).toBe('c');
  });

  it('removing a Watched current entry leaves next pointing at the entry after it', () => {
    const q = clearWatched(queueOf(['a', 'b', 'c', 'd'], 1), watched);
    expect(currentEntry(q)?.videoId).toBe('a');
    expect(advance(q, settings()).play).toBe('c');
  });

  it('can be undone exactly, like Clear', () => {
    const before = queueOf(['a', 'b', 'c', 'd', 'e'], 3);
    const after = clearWatched(before, watched);
    expect(restore(after, { entries: before.entries, currentId: before.currentId, currentAfter: after.currentId })).toEqual(before);
  });
});

group('Stop point', () => {
  it('pauses instead of Advancing when the Stop point entry ends, and clears itself', () => {
    const q = setStopPoint(queueOf(['a', 'b', 'c'], 1), 'id2');
    expect(stopsHere(q)).toBe(true);
    const step = videoEnded(q, settings());
    expect(step.play).toBeNull();
    expect(step.stopped).toBe(true);
    expect(step.queue.stopAfterId).toBeNull();
    expect(currentEntry(step.queue)?.videoId).toBe('b');
  });

  it('pauses there even with Auto-advance off, and still clears', () => {
    const step = videoEnded(setStopPoint(queueOf(['a', 'b'], 0), 'id1'), settings({ autoAdvance: false }));
    expect(step.stopped).toBe(true);
    expect(step.queue.stopAfterId).toBeNull();
  });

  it('Advances as usual from any other entry, keeping the Stop point', () => {
    const step = videoEnded(setStopPoint(queueOf(['a', 'b', 'c'], 0), 'id2'), settings());
    expect(step.play).toBe('b');
    expect(step.stopped).toBe(false);
    expect(step.queue.stopAfterId).toBe('id2');
    expect(stopsHere(step.queue)).toBe(true);
  });

  it('does nothing when an entry ends with Auto-advance off', () => {
    const q = queueOf(['a', 'b'], 0);
    expect(videoEnded(q, settings({ autoAdvance: false }))).toEqual({ queue: q, play: null, stopped: false });
  });

  it('allows one Stop point: setting another replaces it', () => {
    const q = setStopPoint(setStopPoint(queueOf(['a', 'b', 'c']), 'id1'), 'id3');
    expect(q.stopAfterId).toBe('id3');
  });

  it('can be cleared, and ignores entries that are not queued', () => {
    const q = setStopPoint(queueOf(['a', 'b']), 'id1');
    expect(setStopPoint(q, null).stopAfterId).toBeNull();
    expect(setStopPoint(q, 'nope')).toBe(q);
  });

  it('clears when its entry is removed, and comes back with Undo', () => {
    const before = setStopPoint(queueOf(['a', 'b', 'c'], 0), 'id2');
    const after = remove(before, 'id2');
    expect(after.stopAfterId).toBeNull();
    expect(remove(before, 'id3').stopAfterId).toBe('id2');
    expect(restore(after, { ...before, currentAfter: after.currentId }).stopAfterId).toBe('id2');
  });

  it('clears with the queue, and when Remove after playing takes its entry', () => {
    expect(clear(setStopPoint(queueOf(['a']), 'id1')).stopAfterId).toBeNull();
    const q = setStopPoint(queueOf(['a', 'b'], 0), 'id1');
    expect(advance(q, settings({ removeAfterPlaying: true })).queue.stopAfterId).toBeNull();
  });
});

group('secondsLeft / endsAt', () => {
  const timed = (current: number | null, playing = true): Queue => {
    const q = enqueue(EMPTY_QUEUE, [video('a', 200), video('b', 300), video('c', null), video('d', 100)], settings(), 'end', fakeClock());
    const currentId = current === null ? null : q.entries[current].id;
    return { ...q, currentId, nowPlaying: playing && current !== null ? q.entries[current].videoId : null };
  };

  it('adds what is left of the current video to the entries still to come', () => {
    expect(secondsLeft(timed(0), 50)).toBe(150 + 300 + 100);
  });

  it('counts the whole current video before any progress is known', () => {
    expect(secondsLeft(timed(0))).toBe(600);
  });

  it('counts only the entries to come when the player is elsewhere', () => {
    expect(secondsLeft(timed(0, false), 50)).toBe(400);
  });

  it('with nothing current, counts the whole queue', () => {
    expect(secondsLeft(timed(null))).toBe(600);
  });

  it('ends at now plus the time left, from the clock', () => {
    expect(endsAt(timed(1), 100, { now: () => 1_000_000 })).toBe(1_000_000 + (200 + 100) * 1000);
    expect(endsAt(timed(3), 100, { now: () => 5 })).toBeNull();
  });
});

group('sort and shuffle', () => {
  const sample = (current: number | null): Queue => {
    const q = enqueue(
      EMPTY_QUEUE,
      [
        { ...video('a', 300), channel: 'Zed' },
        { ...video('b', 100), channel: 'alpha' },
        { ...video('c', null), channel: 'Beta' },
        { ...video('d', 200), channel: '' },
        { ...video('e', 50), channel: 'Alpha' },
        { ...video('f', null), channel: 'beta' },
      ],
      settings(),
      'end',
      fakeClock()
    );
    return { ...q, currentId: current === null ? null : q.entries[current].id };
  };

  it('shortest first moves only the entries after the current one, unknown lengths last', () => {
    const q = sortUpcoming(sample(1), 'shortest');
    expect(ids(q)).toEqual(['a', 'b', 'e', 'd', 'c', 'f']);
    expect(currentEntry(q)?.videoId).toBe('b');
  });

  it('longest first, unknown lengths still last', () => {
    expect(ids(sortUpcoming(sample(1), 'longest'))).toEqual(['a', 'b', 'd', 'e', 'c', 'f']);
  });

  it('by channel groups channels regardless of case, keeping their order, no channel last', () => {
    expect(ids(sortUpcoming(sample(0), 'channel'))).toEqual(['a', 'b', 'e', 'c', 'f', 'd']);
  });

  it('with no current entry, rearranges the whole queue', () => {
    expect(ids(sortUpcoming(sample(null), 'shortest'))).toEqual(['e', 'b', 'd', 'a', 'c', 'f']);
  });

  it('returns the same queue when the order would not change', () => {
    const q = sortUpcoming(sample(1), 'shortest');
    expect(sortUpcoming(q, 'shortest')).toBe(q);
  });

  it('shuffles only the entries after the current one, with a seeded random source', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const q = shuffleUpcoming(sample(1), random);
    expect(ids(q).slice(0, 2)).toEqual(['a', 'b']);
    expect([...ids(q).slice(2)].sort()).toEqual(['c', 'd', 'e', 'f']);
    expect(ids(q)).not.toEqual(ids(sample(1)));
    // The same seed gives the same order.
    seed = 7;
    expect(ids(shuffleUpcoming(sample(1), random))).toEqual(ids(q));
  });

  it('can be undone with the Undo snapshot', () => {
    const before = sample(2);
    const after = sortUpcoming(before, 'longest');
    expect(restore(after, { ...before, currentAfter: after.currentId })).toEqual(before);
  });
});

group('matchesFilter', () => {
  const v = { title: 'Despacito ft. Daddy Yankee', channel: 'Luis Fonsi' };

  it('matches the title or the channel, ignoring case', () => {
    expect(matchesFilter(v, 'despacito')).toBe(true);
    expect(matchesFilter(v, 'FONSI')).toBe(true);
    expect(matchesFilter(v, 'queen')).toBe(false);
  });

  it('ignores accents and surrounding spaces, and matches everything when empty', () => {
    expect(matchesFilter({ title: 'Café del Mar', channel: '' }, '  cafe ')).toBe(true);
    expect(matchesFilter(v, '')).toBe(true);
    expect(matchesFilter(v, '   ')).toBe(true);
  });
});
