// Player tab only: at the Stop point, pauses just before the video ends, so YouTube's own autoplay
// never starts, then reports the end so the Stop point clears itself. If the video does reach
// its end (a seek past the last moment), `cancelAutoplay` keeps YouTube from moving on.
import browser from 'webextension-polyfill';
import * as Q from '../domain/queue';
import { parseVideoId } from '../domain/youtube';
import { send } from '../shared/messages';
import { KEYS, readQueue } from '../shared/state';

/** How close to the end to pause. timeupdate fires about four times a second. */
const BEFORE_END_SEC = 0.6;

const adShowing = () => document.querySelector('#movie_player.ad-showing') !== null;
const isMain = (target: EventTarget | null): target is HTMLVideoElement =>
  target instanceof HTMLVideoElement && target.classList.contains('html5-main-video');

export function pauseAtStopPoint(isPlayer: () => boolean): void {
  /** The video of the current entry while it is the Stop point. */
  let stopVideo: string | null = null;
  const read = (raw: unknown) => {
    const queue = readQueue(raw);
    stopVideo = Q.stopsHere(queue) ? (Q.currentEntry(queue)?.videoId ?? null) : null;
  };
  browser.storage.local.get(KEYS.queue).then((stored) => read(stored[KEYS.queue]));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEYS.queue in changes) read(changes[KEYS.queue].newValue);
  });

  document.addEventListener(
    'timeupdate',
    (event) => {
      const video = event.target;
      if (!isMain(video) || !isPlayer() || !stopVideo || adShowing() || video.paused) return;
      const videoId = parseVideoId(location.href);
      if (videoId !== stopVideo || !Number.isFinite(video.duration) || video.duration - video.currentTime > BEFORE_END_SEC) return;
      video.pause();
      stopVideo = null; // until the queue says otherwise
      send({ type: 'player/ended', videoId, durationSec: Math.round(video.duration) }).catch(() => {});
    },
    true
  );
}

/** Clicks Cancel on YouTube's "Up next" countdown for a few seconds, and keeps the video paused. */
export function cancelAutoplay(): void {
  const until = Date.now() + 8000;
  const tick = () => {
    document.querySelector<HTMLElement>('.ytp-autonav-endscreen-upnext-cancel-button')?.click();
    if (Date.now() < until) setTimeout(tick, 250);
  };
  tick();
}
