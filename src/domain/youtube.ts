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

/** The video a main-site watch, shorts or live page (or a youtu.be link) points at. */
export function parseVideoId(url: string | undefined): string | null {
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
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** Every distinct video id mentioned in free text, in order of first appearance. */
export function findVideoIds(text: string): string[] {
  const urls =
    text.match(/(?<![\w.-])(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+/gi) ?? [];
  const ids = urls
    .map((url) => parseVideoId(/^https?:/i.test(url) ? url : `https://${url}`))
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** Browser new-tab pages: a tab showing one has not "landed" anywhere yet. */
export function isNewTabPage(url: string | undefined): boolean {
  return !url || NEW_TAB_URLS.test(url);
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
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
