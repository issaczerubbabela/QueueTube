// Runs on www.youtube.com. In the player tab it mounts the queue panel into YouTube's
// secondary column and reports when a video ends or its details become known.
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { parseVideoId } from '../domain/youtube';
import type { RoleQuery, TabMessage } from '../shared/messages';
import { send } from '../shared/messages';
import { Sidebar } from '../sidebar/Sidebar';
import sidebarCss from '../sidebar/sidebar.css?inline';

const HOST_ID = 'queuetube-host';

// After an extension reload the old copy of this script is orphaned but keeps running, and its
// observer would put its panel back. Each copy stamps its panel; an older copy that sees a
// newer copy's panel removes its own and stops.
const INSTANCE = String(performance.now());
const isStale = (el: Element) => el instanceof HTMLElement && Number(el.dataset.instance ?? -1) < Number(INSTANCE);
document.querySelectorAll(`#${HOST_ID}`).forEach((el) => isStale(el) && el.remove());

let host: HTMLElement | null = null;
let root: Root | null = null;
let isPlayer = false;

function secondaryColumn(): HTMLElement | null {
  return document.querySelector<HTMLElement>('ytd-watch-flexy #secondary-inner') ??
    document.querySelector<HTMLElement>('ytd-watch-flexy #secondary');
}

function syncTheme() {
  host?.setAttribute('data-theme', document.documentElement.hasAttribute('dark') ? 'dark' : 'light');
}

/** Keeps the panel at the top of the secondary column, which YouTube creates lazily. */
let placementScheduled = false;
function schedulePlacement() {
  if (placementScheduled || !host) return;
  placementScheduled = true;
  requestAnimationFrame(() => {
    placementScheduled = false;
    if (!host) return;
    if ([...document.querySelectorAll(`#${HOST_ID}`)].some((el) => el !== host && !isStale(el))) return unmount();
    const column = secondaryColumn();
    if (column && (host.parentElement !== column || column.firstElementChild !== host)) column.prepend(host);
    host.hidden = !column || !location.pathname.startsWith('/watch');
  });
}

const observer = new MutationObserver(schedulePlacement);
const themeObserver = new MutationObserver(syncTheme);

function mount() {
  if (host) return;
  host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.instance = INSTANCE;
  host.hidden = true;
  // Page styles outrank :host rules, so spacing against YouTube's list is set inline.
  host.style.marginBottom = '16px';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = sidebarCss;
  const mountPoint = document.createElement('div');
  shadow.append(style, mountPoint);
  syncTheme();
  document.body.append(host);

  root = createRoot(mountPoint);
  root.render(React.createElement(Sidebar));
  observer.observe(document.body, { childList: true, subtree: true });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  schedulePlacement();
}

function unmount() {
  observer.disconnect();
  themeObserver.disconnect();
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

function setRole(player: boolean) {
  isPlayer = player;
  if (player) mount();
  else unmount();
}

// ── Playback reporting (player tab only) ────────────────────────────────────

const playerVideo = (target: EventTarget | null): HTMLVideoElement | null =>
  target instanceof HTMLVideoElement && target.classList.contains('html5-main-video') ? target : null;

const adShowing = () => document.querySelector('#movie_player.ad-showing') !== null;

// Media events do not bubble, but they can be caught on the way down.
document.addEventListener(
  'ended',
  (event) => {
    if (!isPlayer || !playerVideo(event.target) || adShowing()) return;
    send({ type: 'player/ended', videoId: parseVideoId(location.href) }).catch(() => {});
  },
  true
);

document.addEventListener(
  'loadedmetadata',
  (event) => {
    const video = playerVideo(event.target);
    if (!isPlayer || !video || adShowing() || !Number.isFinite(video.duration)) return;
    // Only trust the duration when the URL and YouTube's own idea of the video agree; during
    // an in-page navigation one can briefly lag the other. Title and channel come from oEmbed.
    const videoId = parseVideoId(location.href);
    const flexyId = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
    if (!videoId || (flexyId && flexyId !== videoId)) return;
    send({ type: 'player/describe', videoId, title: '', channel: '', durationSec: Math.round(video.duration) }).catch(() => {});
  },
  true
);

window.addEventListener('yt-navigate-finish', schedulePlacement);

// ── Wiring ──────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as TabMessage;
  if (msg?.type === 'ping') return Promise.resolve(true);
  if (msg?.type === 'role') {
    setRole(msg.isPlayer);
    return Promise.resolve(true);
  }
  return undefined;
});

browser.runtime
  .sendMessage({ type: 'tab/role' } satisfies RoleQuery)
  .then((reply) => setRole(Boolean((reply as { isPlayer?: boolean })?.isPlayer)))
  .catch(() => {});
