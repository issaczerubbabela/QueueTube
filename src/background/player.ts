// The player tab: finding it, electing it, and loading videos into it.
import browser from 'webextension-polyfill';
import { isNewTabPage, isYouTubeSite, parseVideoId, watchUrl } from '../domain/youtube';
import type { TabMessage } from '../shared/messages';
import { TabBook, forgetTab, saveBook } from './store';

async function getTab(tabId: number): Promise<browser.Tabs.Tab | null> {
  try {
    return await browser.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function tell(tabId: number, message: TabMessage): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

/** Makes sure the content script runs in a tab (it is missing after an extension update). */
async function ensureContentScript(tabId: number): Promise<void> {
  if (await tell(tabId, { type: 'ping' })) return;
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['content/index.js'] });
  } catch (err) {
    console.warn('[Cue] Could not inject content script into tab', tabId, err);
  }
}

/** The player tab id, or null if that tab is gone or has left YouTube. Clears a stale id. */
export async function currentPlayer(book: TabBook): Promise<number | null> {
  if (book.playerTabId === null) return null;
  const tab = await getTab(book.playerTabId);
  // A tab we just opened has no committed URL yet; its pending URL (Chrome) or the fact that
  // it is still loading a blank page (Firefox) is enough.
  const stillOpening = tab?.status === 'loading' && isNewTabPage(tab.url);
  if (tab && (isYouTubeSite(tab.url) || isYouTubeSite(tab.pendingUrl) || stillOpening)) return book.playerTabId;
  await setPlayer(book, null);
  return null;
}

/** `loading` skips content-script injection for a tab whose page has not loaded yet; the
 * manifest content script will ask for its role itself. */
export async function setPlayer(book: TabBook, tabId: number | null, loading = false): Promise<void> {
  const previous = book.playerTabId;
  if (previous === tabId) return;
  book.playerTabId = tabId;
  if (tabId !== null) forgetTab(book, tabId);
  await saveBook(book);
  if (previous !== null) await tell(previous, { type: 'role', isPlayer: false });
  if (tabId !== null && !loading) {
    await ensureContentScript(tabId);
    await tell(tabId, { type: 'role', isPlayer: true });
  }
}

/**
 * Picks an open YouTube tab to be the player when there is none: the active tab if it is on
 * YouTube, otherwise a watch page, otherwise any YouTube page. Returns the video it shows.
 */
export async function electPlayer(book: TabBook): Promise<{ tabId: number; videoId: string | null } | null> {
  const tabs = (await browser.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] })).filter(
    (t) => t.id !== undefined && !book.free.includes(t.id) && !book.fresh.includes(t.id)
  );
  const [focused] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const pick =
    tabs.find((t) => t.id === focused?.id) ?? tabs.find((t) => parseVideoId(t.url)) ?? tabs[0];
  if (!pick?.id) return null;
  await setPlayer(book, pick.id);
  return { tabId: pick.id, videoId: parseVideoId(pick.url) };
}

export async function focusTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
}

/** Shows the player tab, opening YouTube as a new player if there is none. */
export async function focusPlayer(book: TabBook): Promise<void> {
  const playerId = await currentPlayer(book);
  if (playerId !== null) return focusTab(playerId);
  const tab = await browser.tabs.create({ url: 'https://www.youtube.com/', active: true });
  if (tab.id !== undefined) await setPlayer(book, tab.id, true);
}

/**
 * Loads a video in the player tab, opening a new player tab if there is none. `startSec` (its
 * Watch progress) is passed to YouTube as `t=`. A video already on screen is left playing.
 */
export async function loadVideo(book: TabBook, videoId: string, startSec: number | null = null): Promise<void> {
  const playerId = await currentPlayer(book);
  if (playerId === null) {
    const tab = await browser.tabs.create({ url: watchUrl(videoId, startSec), active: true });
    if (tab.id !== undefined) await setPlayer(book, tab.id, true);
    return;
  }
  const tab = await getTab(playerId);
  if (parseVideoId(tab?.url) === videoId) return;
  await browser.tabs.update(playerId, { url: watchUrl(videoId, startSec) });
}
