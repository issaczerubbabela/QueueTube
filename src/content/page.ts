// Runs in YouTube's own page context (see ADR 0003), so YouTube's "next" and "previous" controls
// can follow the queue: media keys / headphone buttons (Media Session) and the Shift+N shortcut.
// It has no extension APIs. The content script in the player tab marks on <html> which directions
// the queue can take (data-cue-next / data-cue-previous) and turns a `cue-media` event into a
// Command. When the queue has nothing that way, YouTube's own behaviour is left alone.
//
// Declared as a "MAIN" world content script. Firefox before 128 ignores `world` and runs it as an
// ordinary content script instead; it then injects itself into the page as a <script>.
export {};

declare const browser: { runtime?: { getURL?: (path: string) => string } } | undefined;

type Direction = 'next' | 'previous';
type Handler = MediaSessionActionHandler | null;
const ACTIONS: Record<Direction, MediaSessionAction> = { next: 'nexttrack', previous: 'previoustrack' };
const MARKER = 'cuePageScript';

const runtime = typeof browser !== 'undefined' ? browser?.runtime : undefined;
const root = document.documentElement;

if (runtime?.getURL) {
  const script = document.createElement('script');
  script.src = runtime.getURL('page/index.js');
  script.onload = () => script.remove();
  (document.head ?? root).append(script);
} else if (!root.dataset[MARKER]) {
  root.dataset[MARKER] = '1';
  takeOver();
}

function takeOver() {
  const queueHas = (direction: Direction) => root.dataset[direction === 'next' ? 'cueNext' : 'cuePrevious'] === '1';
  const ask = (direction: Direction) => window.dispatchEvent(new CustomEvent('cue-media', { detail: direction }));

  // ── Media keys ──
  const setActionHandler = MediaSession.prototype.setActionHandler;
  const youtubes: Record<Direction, Handler> = { next: null, previous: null };
  const ours: Record<Direction, MediaSessionActionHandler> = { next: () => ask('next'), previous: () => ask('previous') };
  const install = (direction: Direction) =>
    setActionHandler.call(navigator.mediaSession, ACTIONS[direction], queueHas(direction) ? ours[direction] : youtubes[direction]);

  MediaSession.prototype.setActionHandler = function (action: MediaSessionAction, handler: Handler) {
    const direction = (Object.keys(ACTIONS) as Direction[]).find((d) => ACTIONS[d] === action);
    if (!direction || this !== navigator.mediaSession) return setActionHandler.call(this, action, handler);
    youtubes[direction] = handler;
    install(direction);
  };
  // The queue gaining or losing a video in either direction swaps the handlers.
  new MutationObserver(() => {
    install('next');
    install('previous');
  }).observe(root, { attributes: true, attributeFilter: ['data-cue-next', 'data-cue-previous'] });

  // ── Shift+N ── (on window in the capture phase: before any of YouTube's key listeners)
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'N' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.composedPath()[0];
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!queueHas('next')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) ask('next');
    },
    true
  );
}
