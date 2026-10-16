import { describe, expect, it } from 'vitest';
import { findVideoIds, formatDuration, isNewTabPage, isYouTubeSite, parseVideoId } from './youtube';

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
