import { describe, expect, it } from 'vitest';
import playlistContinuation from './fixtures/playlist-continuation.json';
import playlistPage from './fixtures/playlist-page.json';
import {
  extractPageData,
  findVideoIds,
  findVideoLinks,
  formatDuration,
  innertubeConfig,
  isNewTabPage,
  isYouTubeSite,
  parsePlaylistId,
  parseStartTime,
  parseVideoId,
  parseVideoLink,
  playlistVideos,
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

describe('parsePlaylistId', () => {
  it.each([
    ['https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'],
    ['https://youtube.com/playlist?list=OLAK5uy_abc-DEF', 'OLAK5uy_abc-DEF'],
    ['https://m.youtube.com/playlist?list=PLabc&si=x', 'PLabc'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&index=3', 'PLabc'],
    ['https://youtu.be/dQw4w9WgXcQ?list=PLabc', 'PLabc'],
  ])('reads %s', (url, id) => {
    expect(parsePlaylistId(url)).toBe(id);
  });

  it.each([
    ['a plain video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['Watch later (needs sign-in)', 'https://www.youtube.com/playlist?list=WL'],
    ['Liked videos (needs sign-in)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=LL'],
    ['YouTube Music', 'https://music.youtube.com/playlist?list=PLabc'],
    ['a channel page', 'https://www.youtube.com/@YouTube/videos?list=PLabc'],
    ['an odd id', 'https://www.youtube.com/playlist?list=a%20b'],
  ])('ignores %s', (_label, url) => {
    expect(parsePlaylistId(url)).toBeNull();
  });
});

describe('playlistVideos', () => {
  it('reads the videos in order with their details, and the next-page token, from a playlist page', () => {
    const { videos, continuation } = playlistVideos(playlistPage);
    expect(videos.map((v) => v.videoId)).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk']);
    expect(videos[0]).toEqual({ videoId: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)', channel: 'Rick Astley', durationSec: 213 });
    expect(continuation).toBe('4qmFsgJhEiRWTFBMZml4dHVyZRoUQ0FGNkJsQkVPa05IVVElM0QlM0Q%3D');
  });

  it('skips unplayable (private or deleted) videos', () => {
    expect(playlistVideos(playlistPage).videos.some((v) => v.videoId === 'aaaaaaaaaaa')).toBe(false);
  });

  it('reads a continuation response, the last page having no token', () => {
    const { videos, continuation } = playlistVideos(playlistContinuation);
    expect(videos.map((v) => v.videoId)).toEqual(['OPf0YbXqDm0', 'fJ9rUzIMcZQ', 'dQw4w9WgXcQ']);
    expect(continuation).toBeNull();
  });

  it('finds nothing in unrelated data', () => {
    expect(playlistVideos({ contents: [] })).toEqual({ videos: [], continuation: null });
    expect(playlistVideos(null)).toEqual({ videos: [], continuation: null });
  });
});

describe('extractPageData', () => {
  const data = { a: 'curly } and { braces', b: 'quote \\" and </script>', list: [1, { c: 2 }] };
  const html = `<html><script>var ytcfg = {};</script><script nonce="x">var ytInitialData = ${JSON.stringify(data)};</script><script>var other = {"x":1};</script>`;

  it('reads the object assigned to ytInitialData, braces and quotes in strings included', () => {
    expect(extractPageData(html)).toEqual(data);
  });

  it('also reads window["ytInitialData"] = …', () => {
    expect(extractPageData(`<script>window["ytInitialData"] = {"ok":true};</script>`)).toEqual({ ok: true });
  });

  it('is null when the page has none, or it is cut short', () => {
    expect(extractPageData('<html></html>')).toBeNull();
    expect(extractPageData('var ytInitialData = {"a": [1, 2')).toBeNull();
  });
});

describe('innertubeConfig', () => {
  it('reads the API key and client version from the page config', () => {
    const html = `ytcfg.set({"INNERTUBE_API_KEY":"AIzaFake","INNERTUBE_CLIENT_VERSION":"2.20261015.01.00"});`;
    expect(innertubeConfig(html)).toEqual({ apiKey: 'AIzaFake', clientVersion: '2.20261015.01.00' });
  });

  it('falls back to a recent web client version without a key', () => {
    expect(innertubeConfig('').apiKey).toBeNull();
    expect(innertubeConfig('').clientVersion).toMatch(/^2\.\d{8}/);
  });
});
