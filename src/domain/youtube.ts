// What counts as "YouTube" for Cue. Subdomains such as music.youtube.com and
// studio.youtube.com are deliberately excluded: they are separate products and must never
// be queued, gathered, or turned into the player tab.

const VIDEO_ID = /^[\w-]{11}$/;
const SITE_HOSTS = new Set(['www.youtube.com', 'youtube.com']);
const VIDEO_HOSTS = new Set([...SITE_HOSTS, 'm.youtube.com']);
const NEW_TAB_URLS = /^(about:(blank|newtab|home|privatebrowsing)|chrome:\/\/(newtab|new-tab-page)|chrome-search:\/\/|edge:\/\/newtab|brave:\/\/newtab|vivaldi:\/\/newtab)/;

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** True for pages of the main YouTube site (not YouTube Music, Studio, etc.). */
export function isYouTubeSite(url: string | undefined): boolean {
  const parsed = parse(url);
  return parsed !== null && SITE_HOSTS.has(parsed.hostname);
}

/** A link to a video, with the time it asks to start at (`t=1m30s`), if any. */
export interface VideoLink {
  videoId: string;
  /** Seconds, or null when the link doesn't name a start time. */
  start: number | null;
}

/** Reads a start time in YouTube's forms: `90`, `90s`, `1m30s`, `1h2m3s`. */
export function parseStartTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!match || match[0] === '') return null;
  const [, h, m, s] = match;
  const seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return seconds > 0 ? seconds : null;
}

/** The video a main-site watch, shorts or live page (or a youtu.be link) points at, and its start time. */
export function parseVideoLink(url: string | undefined): VideoLink | null {
  const parsed = parse(url);
  if (!parsed) return null;

  let candidate: string | null = null;
  if (parsed.hostname === 'youtu.be') {
    candidate = parsed.pathname.slice(1).split('/')[0];
  } else if (VIDEO_HOSTS.has(parsed.hostname)) {
    if (parsed.pathname === '/watch') {
      candidate = parsed.searchParams.get('v');
    } else {
      const match = parsed.pathname.match(/^\/(?:shorts|live)\/([^/]+)/);
      candidate = match ? match[1] : null;
    }
  }
  if (!candidate || !VIDEO_ID.test(candidate)) return null;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  const start = parseStartTime(parsed.searchParams.get('t') ?? parsed.searchParams.get('start') ?? hash.get('t'));
  return { videoId: candidate, start };
}

/** The video a main-site watch, shorts or live page (or a youtu.be link) points at. */
export function parseVideoId(url: string | undefined): string | null {
  return parseVideoLink(url)?.videoId ?? null;
}

/** Every distinct video linked in free text, in order of first appearance, with its start time. */
export function findVideoLinks(text: string): VideoLink[] {
  const urls =
    text.match(/(?<![\w.-])(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+/gi) ?? [];
  const links = new Map<string, VideoLink>();
  for (const url of urls) {
    const link = parseVideoLink(/^https?:/i.test(url) ? url : `https://${url}`);
    if (link && !links.has(link.videoId)) links.set(link.videoId, link);
  }
  return [...links.values()];
}

/** Every distinct video id mentioned in free text, in order of first appearance. */
export function findVideoIds(text: string): string[] {
  return findVideoLinks(text).map((link) => link.videoId);
}

/** The start times links ask for, by video id, as `queue/add` takes them. */
export function startTimes(links: VideoLink[]): Record<string, number> {
  return Object.fromEntries(links.filter((l) => l.start !== null).map((l) => [l.videoId, l.start!]));
}

/** Browser new-tab pages: a tab showing one has not "landed" anywhere yet. */
export function isNewTabPage(url: string | undefined): boolean {
  return !url || NEW_TAB_URLS.test(url);
}

export const watchUrl = (videoId: string, startSec: number | null = null) =>
  `https://www.youtube.com/watch?v=${videoId}${startSec ? `&t=${Math.floor(startSec)}s` : ''}`;
export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
export const playlistUrl = (videoIds: string[]) =>
  `https://www.youtube.com/watch_videos?video_ids=${videoIds.slice(0, 50).join(',')}`;

export interface VideoInfo {
  title: string;
  channel: string;
}

/** Title and channel from YouTube's oEmbed endpoint, or null if unavailable. */
export async function fetchVideoInfo(videoId: string, timeoutMs = 5000): Promise<VideoInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { title: String(data.title ?? ''), channel: String(data.author_name ?? '') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The video's length in seconds, read from its watch page (about 0.75 MB, fetched without the
 * user's cookies). oEmbed does not report it, so this streams the page and stops reading as
 * soon as the player config mentions the length.
 */
export async function fetchDuration(videoId: string, timeoutMs = 8000): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(watchUrl(videoId), { credentials: 'omit', signal: controller.signal });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (text.length < 3_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const match = text.match(/"lengthSeconds":"(\d+)"/);
      if (match) {
        reader.cancel().catch(() => {});
        return Number(match[1]);
      }
    }
    reader.cancel().catch(() => {});
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ── Playlists ────────────────────────────────────────────────────────────────

const PLAYLIST_ID = /^[\w-]{2,64}$/;
/** Watch later, Liked videos and Liked music only exist for a signed-in user. */
const PRIVATE_PLAYLISTS = new Set(['WL', 'LL', 'LM']);

/** The playlist a /playlist page, or a watch link played from a playlist (`list=`), points at. */
export function parsePlaylistId(url: string | undefined): string | null {
  const parsed = parse(url);
  if (!parsed || !(VIDEO_HOSTS.has(parsed.hostname) || parsed.hostname === 'youtu.be')) return null;
  const isPlaylistPage = parsed.pathname === '/playlist';
  const isVideo = parsed.hostname === 'youtu.be' || parsed.pathname === '/watch' || /^\/(shorts|live)\//.test(parsed.pathname);
  if (!isPlaylistPage && !isVideo) return null;
  const list = parsed.searchParams.get('list');
  return list && PLAYLIST_ID.test(list) && !PRIVATE_PLAYLISTS.has(list) ? list : null;
}

export const playlistPageUrl = (listId: string) => `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;

/**
 * The JSON object assigned to `name` in a page's scripts (`var ytInitialData = {…};`), or null.
 * Scans braces outside strings, since the object is far too large for a regex.
 */
export function extractPageData(html: string, name = 'ytInitialData'): unknown {
  const at = html.search(new RegExp(`(?:var\\s+${name}|window\\[["']${name}["']\\]|\\b${name})\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** A video as a playlist lists it, with whatever details it gives. */
export type PlaylistVideo = { videoId: string; title: string; channel: string; durationSec: number | null };

export interface PlaylistPage {
  videos: PlaylistVideo[];
  /** Token for the next page of a long playlist, or null on the last page. */
  continuation: string | null;
}

const runsText = (value: unknown): string => {
  const v = value as { simpleText?: string; runs?: { text?: string }[]; content?: string } | undefined;
  return v?.simpleText ?? v?.content ?? v?.runs?.map((r) => r.text ?? '').join('') ?? '';
};

/**
 * The videos (in order) and the next-page token in YouTube's playlist data: a playlist page's
 * ytInitialData or a continuation response. It walks the whole object instead of following one
 * path, so a reshuffle of YouTube's layout doesn't break it. Unplayable (deleted or private)
 * videos are skipped.
 */
export function playlistVideos(data: unknown): PlaylistPage {
  const videos: PlaylistVideo[] = [];
  const seen = new Set<string>();
  let continuation: string | null = null;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const o = node as Record<string, any>;
    const add = (video: PlaylistVideo) => {
      if (!VIDEO_ID.test(video.videoId) || seen.has(video.videoId)) return;
      seen.add(video.videoId);
      videos.push(video);
    };
    const item = o.playlistVideoRenderer;
    if (item && typeof item.videoId === 'string') {
      const length = Number(item.lengthSeconds);
      if (item.isPlayable !== false) add({ videoId: item.videoId, title: runsText(item.title), channel: runsText(item.shortBylineText), durationSec: length > 0 ? length : null });
      return;
    }
    // The newer layout YouTube serves some playlist pages in.
    const lockup = o.lockupViewModel;
    if (lockup && typeof lockup.contentId === 'string') {
      if (lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const meta = lockup.metadata?.lockupMetadataViewModel;
        const badge = lockup.contentImage?.thumbnailViewModel?.overlays
          ?.flatMap((overlay: any) => overlay?.thumbnailBottomOverlayViewModel?.badges ?? [])
          .map((b: any) => b?.thumbnailBadgeViewModel?.text)
          .find((text: unknown) => typeof text === 'string' && /^\d+(:\d{2}){1,2}$/.test(text));
        add({
          videoId: lockup.contentId,
          title: runsText(meta?.title),
          channel: runsText(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text),
          durationSec: badge ? badge.split(':').reduce((sum: number, part: string) => sum * 60 + Number(part), 0) : null,
        });
      }
      return;
    }
    // The list's own next page comes first; a later section can carry a token of its own.
    const token =
      o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ??
      o.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token;
    if (typeof token === 'string') {
      continuation ??= token;
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(data);
  return { videos, continuation };
}

/** What a page tells scripts about calling YouTube's own API for more of a list. */
export function innertubeConfig(html: string): { apiKey: string | null; clientVersion: string } {
  return {
    apiKey: /"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null,
    clientVersion: /"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? /"clientVersion"\s*:\s*"([\d.]+)"/.exec(html)?.[1] ?? '2.20250101.00.00',
  };
}

export interface FetchedPlaylist {
  videos: PlaylistVideo[];
  /** False when YouTube stopped sending pages before the end of the list. */
  complete: boolean;
}

/**
 * Every video in a public playlist, read from its page and the pages after it, as YouTube's own
 * site does. No sign-in and no API key of ours: requests go without the user's cookies.
 * Null when the playlist can't be read at all.
 */
export async function fetchPlaylist(listId: string, { maxPages = 100, timeoutMs = 15000 } = {}): Promise<FetchedPlaylist | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs * 4);
  try {
    const res = await fetch(playlistPageUrl(listId), { credentials: 'omit', signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const first = playlistVideos(extractPageData(html));
    if (first.videos.length === 0) return null;
    const { apiKey, clientVersion } = innertubeConfig(html);
    const videos = [...first.videos];
    const seen = new Set(videos.map((v) => v.videoId));
    let token = first.continuation;
    for (let page = 1; token && page < maxPages; page++) {
      const more = await fetch(`https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${apiKey ? `&key=${apiKey}` : ''}`, {
        method: 'POST',
        credentials: 'omit',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } }, continuation: token }),
      }).catch(() => null);
      if (!more?.ok) return { videos, complete: false };
      const next = playlistVideos(await more.json());
      for (const v of next.videos) if (!seen.has(v.videoId)) seen.add(v.videoId), videos.push(v);
      token = next.continuation;
    }
    return { videos, complete: token === null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
