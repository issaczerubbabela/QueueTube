// Player tab only: reports how far into the video it is, about every 10 seconds while it plays,
// when it pauses or is scrubbed while paused, and when the page is hidden or navigates away. The background script decides
// what to keep (domain/progress.ts).
import { parseVideoId } from '../domain/youtube';
import { send } from '../shared/messages';

const EVERY_MS = 10_000;

const mainVideo = () => document.querySelector<HTMLVideoElement>('video.html5-main-video');
const adShowing = () => document.querySelector('#movie_player.ad-showing') !== null;

/** The video on the page, when the URL and YouTube's own idea of it agree (they can lag each other mid-navigation). */
function videoOnPage(): string | null {
  const videoId = parseVideoId(location.href);
  const flexyId = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
  return videoId && (!flexyId || flexyId === videoId) ? videoId : null;
}

export function reportWatchProgress(isPlayer: () => boolean): void {
  /**
   * The video the player element holds, settled when its metadata loads: on an in-page
   * navigation the old video's last moments still belong to the old video. Null after an ad's
   * metadata, until the video itself is known again.
   */
  let loaded: string | null = null;
  let lastSent = 0;

  const report = () => {
    const video = mainVideo();
    if (!isPlayer() || !video || adShowing()) return;
    loaded ??= videoOnPage();
    // A stale `loaded` (the URL moved on to another video) reports nothing rather than the wrong video.
    if (!loaded || loaded !== parseVideoId(location.href)) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime <= 0) return;
    lastSent = Date.now();
    send({ type: 'player/progress', videoId: loaded, positionSec: video.currentTime, durationSec: Math.round(video.duration) }).catch(() => {});
  };

  const isMain = (target: EventTarget | null) => target instanceof HTMLVideoElement && target.classList.contains('html5-main-video');

  // Media events don't bubble, but they can be caught on the way down.
  document.addEventListener(
    'loadedmetadata',
    (event) => {
      if (!isMain(event.target)) return;
      loaded = adShowing() ? null : videoOnPage();
      lastSent = Date.now();
    },
    true
  );
  document.addEventListener(
    'timeupdate',
    (event) => {
      if (isMain(event.target) && Date.now() - lastSent >= EVERY_MS) report();
    },
    true
  );
  document.addEventListener('pause', (event) => isMain(event.target) && report(), true);
  // Scrubbing while paused moves the position without a pause event.
  document.addEventListener('seeked', (event) => isMain(event.target) && (event.target as HTMLVideoElement).paused && report(), true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && report());
  window.addEventListener('pagehide', report);
  window.addEventListener('yt-navigate-start', report);
}
