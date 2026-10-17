// The right-click menu: queue YouTube videos from links on any site, or every video a page or
// selection links to or mentions.
import browser from 'webextension-polyfill';
import type { Position } from '../domain/queue';
import { VideoLink, findVideoLinks, parsePlaylistId, parseVideoLink, startTimes } from '../domain/youtube';

const VIDEO_LINKS = ['www.youtube.com', 'youtube.com', 'm.youtube.com']
  .flatMap((host) => [`*://${host}/watch*`, `*://${host}/shorts/*`, `*://${host}/live/*`])
  .concat('*://youtu.be/*');

const LINK_ITEMS: { id: string; title: string; at: Position }[] = [
  { id: 'cue-add', title: 'Add to queue', at: 'end' },
  { id: 'cue-play-next', title: 'Play next', at: 'next' },
];
const QUEUE_ALL = 'cue-queue-all';

const PLAYLIST_LINKS = ['www.youtube.com', 'youtube.com', 'm.youtube.com']
  .flatMap((host) => [`*://${host}/playlist*`, `*://${host}/watch*list=*`])
  .concat('*://youtu.be/*list=*');
const ADD_PLAYLIST = 'cue-add-playlist';

/** Menus persist in Chrome but not across every Firefox restart, so they are rebuilt on each launch. */
export async function createMenus(): Promise<void> {
  await browser.contextMenus.removeAll();
  for (const { id, title } of LINK_ITEMS) {
    browser.contextMenus.create({ id, title, contexts: ['link'], targetUrlPatterns: VIDEO_LINKS });
  }
  browser.contextMenus.create({ id: ADD_PLAYLIST, title: 'Add playlist to queue', contexts: ['link'], targetUrlPatterns: PLAYLIST_LINKS });
  browser.contextMenus.create({ id: QUEUE_ALL, title: 'Queue all YouTube links here', contexts: ['page', 'selection'] });
}

/**
 * Runs in the page: the selection's (or the whole page's) links and text in document order, so
 * findVideoIds sees videos in the order they appear. Must stay self-contained.
 */
function pageText(): string {
  const selection = getSelection();
  const selected = selection && !selection.isCollapsed ? selection : null;
  const parts: string[] = [];
  const walk = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
      if (selected && !selected.containsNode(node, true)) continue;
      if (node instanceof HTMLAnchorElement && node.href) parts.push(node.href);
      else if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
      else if (node.nodeType === Node.TEXT_NODE && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.parentElement?.tagName ?? '')) {
        parts.push(node.textContent ?? '');
      }
    }
  };
  walk(selected?.rangeCount === 1 ? selected.getRangeAt(0).commonAncestorContainer : document.body);
  return parts.join(' ');
}

async function videosOnPage(tabId: number | undefined, info: browser.Menus.OnClickData): Promise<VideoLink[]> {
  let text = info.selectionText ?? '';
  if (tabId !== undefined) {
    try {
      const [frame] = await browser.scripting.executeScript({ target: { tabId, frameIds: [info.frameId ?? 0] }, func: pageText });
      text = `${frame?.result ?? ''} ${text}`;
    } catch {
      // Pages extensions can't script (browser pages, the web store): fall back to the selected text.
    }
  }
  return findVideoLinks(text);
}

type Add = (videoIds: string[], at: Position, starts: Record<string, number>) => Promise<unknown>;
type AddPlaylist = (listId: string, tabId: number | undefined, frameId: number | undefined) => Promise<unknown>;

/**
 * Calls `add` with the videos a menu item was used on, and the start times their links ask for,
 * or `addPlaylist` with the playlist a link points at.
 */
export function onMenuClick(add: Add, addPlaylist: AddPlaylist): void {
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === ADD_PLAYLIST) {
      const listId = parsePlaylistId(info.linkUrl);
      if (listId) await addPlaylist(listId, tab?.id, info.frameId);
      return;
    }
    if (info.menuItemId === QUEUE_ALL) {
      const links = await videosOnPage(tab?.id, info);
      if (links.length > 0) await add(links.map((l) => l.videoId), 'end', startTimes(links));
      return;
    }
    const item = LINK_ITEMS.find((i) => i.id === info.menuItemId);
    const link = parseVideoLink(info.linkUrl);
    if (item && link) await add([link.videoId], item.at, startTimes([link]));
  });
}
