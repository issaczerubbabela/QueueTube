// Moving queues in and out of Cue as plain text: one "title<TAB>url" line per entry.
import type { Entry, Position } from '../domain/queue';
import { findVideoLinks, startTimes, watchUrl } from '../domain/youtube';
import { send } from '../shared/messages';

export function exportQueue(entries: Entry[]): void {
  const text = entries.map((e) => `${e.title || e.videoId}\t${watchUrl(e.videoId)}`).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cue-${new Date().toISOString().slice(0, 10)}.txt`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Queues every YouTube video linked in a text file. Resolves to a short result message. */
export async function importQueue(file: File): Promise<string> {
  const links = findVideoLinks(await file.text());
  if (links.length === 0) return 'No YouTube links found in that file';
  const { added } = await send({ type: 'queue/add', videoIds: links.map((l) => l.videoId), starts: startTimes(links) });
  if (added === 0) return 'Those videos are already queued';
  return `Added ${added} ${added === 1 ? 'video' : 'videos'}`;
}

/** True while something that can hold links (not files) is dragged over a surface. */
export const mayHoldLinks = (data: DataTransfer) => data.types.includes('text/uri-list') || data.types.includes('text/plain');

/**
 * Queues the YouTube videos in dropped links or text. Anything without a YouTube link does
 * nothing. Resolves to a message to show, or null. Reads the data before awaiting, as the
 * browser empties it once the drop event is over.
 */
export async function dropVideos(data: DataTransfer, at: Position): Promise<string | null> {
  const links = findVideoLinks(`${data.getData('text/uri-list')}
${data.getData('text/plain')}`);
  if (links.length === 0) return null;
  const videoIds = links.map((l) => l.videoId);
  const { added } = await send({ type: 'queue/add', videoIds, at, starts: startTimes(links) });
  return added > 0 ? null : videoIds.length === 1 ? 'That video is already queued' : 'Those videos are already queued';
}

export const pluralVideos = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`;

export function formatRemaining(totalSeconds: number): string | null {
  if (totalSeconds < 60) return null;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}
