import { describe as group, expect, it } from 'vitest';
import {
  EMPTY_PROGRESS,
  PROGRESS_LIMIT,
  ProgressMap,
  isWatched,
  markWatched,
  recordPosition,
  resumeAt,
  setStart,
  setStarts,
  watchedFraction,
  watchedVideos,
} from './progress';

function fakeClock(start = 1000) {
  let n = start;
  return { now: () => n++ };
}

group('recordPosition', () => {
  it('saves nothing in the first 30 seconds', () => {
    expect(recordPosition(EMPTY_PROGRESS, 'a', 29, 600, fakeClock())).toEqual({});
  });

  it('saves the position from 30 seconds in', () => {
    const map = recordPosition(EMPTY_PROGRESS, 'a', 30.6, 600, fakeClock());
    expect(map.a).toMatchObject({ position: 30, duration: 600, watched: false });
    expect(resumeAt(map, 'a')).toBe(30);
  });

  it('makes the video Watched at 90% and clears its resume point', () => {
    let map = recordPosition(EMPTY_PROGRESS, 'a', 300, 600, fakeClock());
    map = recordPosition(map, 'a', 540, 600, fakeClock());
    expect(isWatched(map, 'a')).toBe(true);
    expect(resumeAt(map, 'a')).toBeNull();
  });

  it('just under 90% is still progress', () => {
    const map = recordPosition(EMPTY_PROGRESS, 'a', 539, 600, fakeClock());
    expect(isWatched(map, 'a')).toBe(false);
    expect(resumeAt(map, 'a')).toBe(539);
  });

  it('going back under 30 seconds drops the resume point', () => {
    let map = recordPosition(EMPTY_PROGRESS, 'a', 300, 600, fakeClock());
    map = recordPosition(map, 'a', 10, 600, fakeClock());
    expect(map).toEqual({});
  });

  it('keeps a Watched video Watched while it is rewatched from the start', () => {
    const watched = markWatched(EMPTY_PROGRESS, 'a', 600, fakeClock());
    expect(recordPosition(watched, 'a', 12, 600, fakeClock())).toBe(watched);
  });

  it('a Watched video rewatched past 30 seconds resumes from there', () => {
    const map = recordPosition(markWatched(EMPTY_PROGRESS, 'a', 600, fakeClock()), 'a', 100, 600, fakeClock());
    expect(isWatched(map, 'a')).toBe(false);
    expect(resumeAt(map, 'a')).toBe(100);
  });

  it('remembers a known length when the player reports none', () => {
    let map = recordPosition(EMPTY_PROGRESS, 'a', 60, 600, fakeClock());
    map = recordPosition(map, 'a', 550, null, fakeClock());
    expect(isWatched(map, 'a')).toBe(true);
  });

  it('never marks a video of unknown length Watched from its position', () => {
    const map = recordPosition(EMPTY_PROGRESS, 'a', 5000, null, fakeClock());
    expect(isWatched(map, 'a')).toBe(false);
    expect(resumeAt(map, 'a')).toBe(5000);
  });

  it('keeps the 500 most recently updated videos, evicting the least recently updated', () => {
    const clock = fakeClock();
    let map: ProgressMap = EMPTY_PROGRESS;
    for (let i = 0; i < PROGRESS_LIMIT; i++) map = recordPosition(map, `v${i}`, 60, 600, clock);
    // Touch the oldest so it is recent again; v1 is now the least recently updated.
    map = recordPosition(map, 'v0', 90, 600, clock);
    map = recordPosition(map, 'new', 60, 600, clock);
    expect(Object.keys(map)).toHaveLength(PROGRESS_LIMIT);
    expect(map.v0.position).toBe(90);
    expect(map.new).toBeDefined();
    expect(map.v1).toBeUndefined();
    expect(map.v2).toBeDefined();
  });
});

group('markWatched', () => {
  it('marks a video Watched even with no progress saved', () => {
    const map = markWatched(EMPTY_PROGRESS, 'a', 212, fakeClock());
    expect(map.a).toMatchObject({ watched: true, position: 0, duration: 212 });
    expect(watchedVideos(map)).toEqual(new Set(['a']));
  });
});

group('setStart (t= in a link)', () => {
  it('replaces saved progress', () => {
    const map = setStart(recordPosition(EMPTY_PROGRESS, 'a', 300, 600, fakeClock()), 'a', 90, fakeClock());
    expect(resumeAt(map, 'a')).toBe(90);
    expect(map.a.duration).toBe(600);
  });

  it('replaces a Watched mark, so the link is respected', () => {
    const map = setStart(markWatched(EMPTY_PROGRESS, 'a', 600, fakeClock()), 'a', 90, fakeClock());
    expect(isWatched(map, 'a')).toBe(false);
    expect(resumeAt(map, 'a')).toBe(90);
  });

  it('is respected even under 30 seconds', () => {
    expect(resumeAt(setStart(EMPTY_PROGRESS, 'a', 12, fakeClock()), 'a')).toBe(12);
  });

  it('applies several at once and ignores nonsense', () => {
    const map = setStarts(EMPTY_PROGRESS, { a: 90, b: 0, c: Number.NaN }, fakeClock());
    expect(Object.keys(map)).toEqual(['a']);
    expect(setStarts(map, undefined)).toBe(map);
  });
});

group('resumeAt', () => {
  it('is null for a video with no progress', () => {
    expect(resumeAt(EMPTY_PROGRESS, 'a')).toBeNull();
  });
});

group('watchedFraction', () => {
  it('is the share of the video watched, 1 once Watched', () => {
    const map = recordPosition(EMPTY_PROGRESS, 'a', 150, 600, fakeClock());
    expect(watchedFraction(map.a)).toBe(0.25);
    expect(watchedFraction(markWatched(map, 'a').a)).toBe(1);
    expect(watchedFraction(undefined)).toBe(0);
  });

  it('falls back to the length the queue knows', () => {
    const map = setStart(EMPTY_PROGRESS, 'a', 60, fakeClock());
    expect(watchedFraction(map.a)).toBe(0);
    expect(watchedFraction(map.a, 120)).toBe(0.5);
  });
});
