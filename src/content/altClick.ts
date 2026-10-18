// Alt+click a video link on any YouTube page to queue it (Alt+Shift+click: Play next) instead of
// opening it. Only the link's address is looked at, never YouTube's markup, so redesigns don't
// break it.
import { VideoLink, parseVideoLink, startTimes } from '../domain/youtube';
import { send } from '../shared/messages';

const CONFIRM_MS = 1400;

function linkedVideo(event: MouseEvent, ignoreId: string): { link: Element; video: VideoLink } | null {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;
    if (target.id === ignoreId) return null; // Cue's own panel
    if (target instanceof HTMLAnchorElement && target.href) {
      const video = parseVideoLink(target.href);
      return video ? { link: target, video } : null;
    }
  }
  return null;
}

/**
 * A short pill centered on the clicked link, in its own shadow root so page styles can't reach it.
 * It follows the link while it shows: in the player tab, queueing adds a row to the panel above
 * the suggestions and pushes them down.
 */
let badge: { host: HTMLElement; label: HTMLElement } | null = null;
let shown = 0;
function confirm(link: Element, text: string): void {
  if (!badge) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      span{display:block;padding:6px 12px;border-radius:16px;background:rgba(15,15,15,.9);color:#fff;
        font:500 14px/20px Roboto,Arial,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);
        animation:in .12s ease-out}
      @keyframes in{from{opacity:0;transform:scale(.9)}}
    </style><span role="status"></span>`;
    badge = { host, label: shadow.querySelector('span')! };
  }
  const current = badge;
  current.label.textContent = text;
  // Re-adding restarts the animation.
  current.host.remove();
  document.body.append(current.host);
  const id = ++shown;
  const until = performance.now() + CONFIRM_MS;
  const follow = () => {
    if (id !== shown) return; // a newer confirmation took over
    if (performance.now() > until || !link.isConnected) return current.host.remove();
    const rect = link.getBoundingClientRect();
    current.host.style.left = `${rect.left + rect.width / 2}px`;
    current.host.style.top = `${rect.top + rect.height / 2}px`;
    requestAnimationFrame(follow);
  };
  follow();
}

/** Listens on window in the capture phase, so it runs before YouTube's own click handling. */
export function listenForAltClicks(panelId: string): void {
  window.addEventListener(
    'click',
    (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.button !== 0) return;
      const found = linkedVideo(event, panelId);
      if (!found) return;
      // Stops YouTube navigating, and Chrome on Windows downloading the link.
      event.preventDefault();
      event.stopImmediatePropagation();
      const at = event.shiftKey ? 'next' : 'end';
      send({ type: 'queue/add', videoIds: [found.video.videoId], at, starts: startTimes([found.video]) })
        .then(({ added }) => confirm(found.link, added === 0 ? 'Already queued' : at === 'next' ? 'Queued to play next' : 'Queued'))
        .catch(() => confirm(found.link, 'Could not queue. Reload the page.'));
    },
    true
  );
}
