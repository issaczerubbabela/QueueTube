import { describe, expect, it } from 'vitest';
import {
  findVideoIds,
  findVideoLinks,
  formatDuration,
  isNewTabPage,
  isYouTubeSite,
  parseStartTime,
  parseVideoId,
  parseVideoLink,
  startTimes,
  watchUrl,
} from './youtube';

describe('parseVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
  ])('reads %s', (url, id) => {
    expect(parseVideoId(url)).toBe(id);
  });

  it.each([
    ['YouTube Music', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['YouTube Studio', 'https://studio.youtube.com/video/dQw4w9WgXcQ/edit'],
    ['a look-alike host', 'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['the home page', 'https://www.youtube.com/'],
    ['a temporary playlist', 'https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ'],
    ['a malformed id', 'https://www.youtube.com/watch?v=short'],
    ['garbage', 'not a url'],
  ])('ignores %s', (_label, url) => {
    expect(parseVideoId(url)).toBeNull();
  });
});

describe('parseVideoLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90', 90],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s', 90],
    ['https://www.youtube.com/watch?t=1m30s&v=dQw4w9WgXcQ', 90],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s', 3723],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m', 120],
    ['https://youtube.com/shorts/dQw4w9WgXcQ?t=45', 45],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?t=1h', 3600],
    ['https://youtu.be/dQw4w9WgXcQ?t=90', 90],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc&t=1m30s', 90],
    ['https://youtu.be/dQw4w9WgXcQ#t=1m30s', 90],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&start=90', 90],
  ])('reads the start time of %s', (url, start) => {
    expect(parseVideoLink(url)).toEqual({ videoId: 'dQw4w9WgXcQ', start });
  });

  it.each([
    ['no t=', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['t=0', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0'],
    ['a malformed t=', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=soon'],
    ['an empty t=', 'https://youtu.be/dQw4w9WgXcQ?t='],
  ])('has no start time with %s', (_label, url) => {
    expect(parseVideoLink(url)).toEqual({ videoId: 'dQw4w9WgXcQ', start: null });
  });

  it('is null where parseVideoId is', () => {
    expect(parseVideoLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&t=90')).toBeNull();
  });
});

describe('parseStartTime', () => {
  it.each([
    ['90', 90],
    ['90s', 90],
    ['1m30s', 90],
    ['1h2m3s', 3723],
    ['1H2M3S', 3723],
    ['', null],
    ['0s', null],
    ['m', null],
    ['1:30', null],
  ])('%s → %s', (value, seconds) => {
    expect(parseStartTime(value)).toBe(seconds);
  });
});

describe('watchUrl', () => {
  it('adds a start time only when there is one', () => {
    expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(watchUrl('dQw4w9WgXcQ', 95.7)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=95s');
    expect(parseVideoLink(watchUrl('dQw4w9WgXcQ', 95))).toEqual({ videoId: 'dQw4w9WgXcQ', start: 95 });
  });
});

describe('isYouTubeSite', () => {
  it('accepts the main site only', () => {
    expect(isYouTubeSite('https://www.youtube.com/feed/subscriptions')).toBe(true);
    expect(isYouTubeSite('https://music.youtube.com/')).toBe(false);
    expect(isYouTubeSite('https://studio.youtube.com/')).toBe(false);
    expect(isYouTubeSite(undefined)).toBe(false);
  });
});

describe('findVideoIds', () => {
  it('extracts distinct ids from exported text in order', () => {
    const text = [
      'First\thttps://www.youtube.com/watch?v=aaaaaaaaaaa',
      'youtu.be/bbbbbbbbbbb and www.youtube.com/watch?v=aaaaaaaaaaa again',
      'music: https://music.youtube.com/watch?v=ccccccccccc',
    ].join('\n');
    expect(findVideoIds(text)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  });
});

describe('findVideoLinks', () => {
  it('keeps the start time of the first link to each video', () => {
    const text = 'youtu.be/aaaaaaaaaaa?t=90 then https://www.youtube.com/watch?v=bbbbbbbbbbb and youtu.be/aaaaaaaaaaa?t=5';
    const links = findVideoLinks(text);
    expect(links).toEqual([
      { videoId: 'aaaaaaaaaaa', start: 90 },
      { videoId: 'bbbbbbbbbbb', start: null },
    ]);
    expect(startTimes(links)).toEqual({ aaaaaaaaaaa: 90 });
  });
});

describe('isNewTabPage', () => {
  it('recognises browser new-tab pages', () => {
    expect(isNewTabPage('chrome://newtab/')).toBe(true);
    expect(isNewTabPage('about:newtab')).toBe(true);
    expect(isNewTabPage('')).toBe(true);
    expect(isNewTabPage('https://example.com')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats seconds like YouTube does', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(212)).toBe('3:32');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(Infinity)).toBeNull();
  });
});
