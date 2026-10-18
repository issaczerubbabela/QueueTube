// A "Queue this playlist" button on YouTube's /playlist pages, in every YouTube tab. It floats
// in the corner in its own shadow root rather than joining YouTube's header, so a redesign of
// that header can't break it.
import { parsePlaylistId } from '../domain/youtube';
import { queuePlaylist } from '../ui/playlist';

const STYLE = `
  button{display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:20px;cursor:pointer;
    font:500 14px/20px Roboto,Arial,sans-serif;color:#0f0f0f;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3)}
  button:hover{background:#e5e5e5}
  button:disabled{cursor:progress;opacity:.8}
  button:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}
  svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  :host([data-theme=dark]) button{color:#fff;background:#272727}
  :host([data-theme=dark]) button:hover{background:#3f3f3f}`;
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h13M3 12h9M3 18h9M16 12v8M12 16h8"/></svg>';
const LABEL = 'Queue this playlist';

export function showPlaylistButton(hostId: string): void {
  let host: HTMLElement | null = null;
  let button: HTMLButtonElement;
  let label: HTMLSpanElement;

  const create = () => {
    host = document.createElement('div');
    host.id = `${hostId}-playlist`;
    host.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2100';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${STYLE}</style><button type="button">${ICON}<span>${LABEL}</span></button>`;
    button = shadow.querySelector('button')!;
    label = shadow.querySelector('span')!;
    button.addEventListener('click', async () => {
      const listId = parsePlaylistId(location.href);
      if (!listId) return;
      button.disabled = true;
      label.textContent = 'Queueing…';
      const message = await queuePlaylist(listId).catch(() => 'Could not queue. Reload the page.');
      label.textContent = message;
      setTimeout(() => {
        button.disabled = false;
        label.textContent = LABEL;
      }, 3000);
    });
  };

  const sync = () => {
    const onPlaylistPage = location.pathname === '/playlist' && parsePlaylistId(location.href) !== null;
    if (!onPlaylistPage) return host?.remove();
    if (!host) create();
    host!.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
    if (!host!.isConnected) document.body.append(host!);
  };

  window.addEventListener('yt-navigate-finish', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();
}
