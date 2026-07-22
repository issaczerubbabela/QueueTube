import { QueueItem } from '../types';

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/shorts/')[1]?.split('?')[0] || null;
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/embed/')[1]?.split('?')[0] || null;
      }
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.substring(1).split('?')[0] || null;
    }
  } catch (err) {
    // If not a valid URL string, try simple regex matching
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    return match ? match[1] : null;
  }
  return null;
}

export function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function fetchVideoMetadata(videoUrlOrId: string): Promise<Partial<QueueItem>> {
  const videoId = extractVideoId(videoUrlOrId) || videoUrlOrId;
  const fullUrl = buildWatchUrl(videoId);
  const fallbackThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(fullUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      return {
        videoId,
        url: fullUrl,
        title: data.title || `YouTube Video (${videoId})`,
        channel: data.author_name || 'YouTube Channel',
        thumbnail: data.thumbnail_url || fallbackThumbnail,
        duration: 'YouTube' // oEmbed does not return duration; will be updated by DOM if loaded
      };
    }
  } catch (err) {
    console.warn('[QueueTube] Failed to fetch oEmbed metadata, using fallbacks:', err);
  }

  return {
    videoId,
    url: fullUrl,
    title: `YouTube Video (${videoId})`,
    channel: 'YouTube Channel',
    thumbnail: fallbackThumbnail,
    duration: '--:--'
  };
}
