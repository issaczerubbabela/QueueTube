// The protocol between UI surfaces / content script and the background worker.
// UI surfaces never write queue state themselves; they send a Command (ADR 0001).
import browser from 'webextension-polyfill';
import type { Position, Settings, SortOrder } from '../domain/queue';

export type Command =
  /**
   * Adds videos at the end (the default), as Play next, or at an index. `starts` holds the start
   * times their links asked for (`t=`), by video id; they replace saved Watch progress.
   */
  | { type: 'queue/add'; videoIds: string[]; at?: Position; starts?: Record<string, number> }
  | { type: 'queue/remove'; entryId: string }
  | { type: 'queue/move'; entryId: string; toIndex: number }
  | { type: 'queue/playNextInLine'; entryId: string }
  /** Sorts or shuffles the entries after the current one; undoable. */
  | { type: 'queue/sort'; order: SortOrder }
  | { type: 'queue/shuffle' }
  /** Sets the Stop point to an entry (replacing any other), or clears it with null. */
  | { type: 'queue/stopPoint'; entryId: string | null }
  | { type: 'queue/clear' }
  /** Removes the entries whose video is Watched; undoable. */
  | { type: 'queue/clearWatched' }
  | { type: 'queue/undo' }
  | { type: 'history/clear' }
  /** Moves an entry's video to the end of the Shelf. */
  | { type: 'shelf/add'; entryId: string }
  /** Moves a video from the Shelf back into the Queue (the end by default, or Play next). */
  | { type: 'shelf/restore'; videoId: string; at?: Position }
  | { type: 'shelf/move'; videoId: string; toIndex: number }
  | { type: 'shelf/remove'; videoId: string }
  | { type: 'play/entry'; entryId: string }
  | { type: 'play/video'; videoId: string }
  | { type: 'play/next' }
  | { type: 'play/previous' }
  | { type: 'player/ended'; videoId: string | null; durationSec?: number | null }
  /** The player tab is `positionSec` into `videoId`; sent every few seconds, on pause and on leaving. */
  | { type: 'player/progress'; videoId: string; positionSec: number; durationSec: number | null }
  | { type: 'player/describe'; videoId: string; title: string; channel: string; durationSec: number | null }
  | { type: 'player/focus' }
  | { type: 'player/claimActiveTab' }
  | { type: 'tabs/gather' }
  | { type: 'tabs/openFree'; url: string }
  /**
   * Queues a whole playlist at the end of the queue. Over PLAYLIST_CONFIRM_ABOVE videos the reply
   * asks for confirmation first; send again with `confirmed`.
   */
  | { type: 'playlist/queue'; listId: string; confirmed?: boolean }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'options/open'; section?: OptionsSection }
  | { type: 'whatsNew/seen' }
  | { type: 'status' };

/** Sections of the settings page that other surfaces link to. */
export type OptionsSection = 'guide' | 'whats-new';

export interface Status {
  playerTabId: number | null;
  /** The active tab in the focused window, when it is a YouTube tab other than the player. */
  claimableTabId: number | null;
  canUndo: boolean;
}

/** Playlists longer than this ask before they are queued. */
export const PLAYLIST_CONFIRM_ABOVE = 100;

export type PlaylistReply =
  | { status: 'queued'; added: number; total: number; complete: boolean }
  | { status: 'confirm'; total: number }
  | { status: 'failed' };

export interface Replies {
  'tabs/gather': { gathered: number };
  'queue/add': { added: number };
  'playlist/queue': PlaylistReply;
  status: Status;
}

export type Reply<C extends Command> = C['type'] extends keyof Replies ? Replies[C['type']] : void;

export function send<C extends Command>(command: C): Promise<Reply<C>> {
  return browser.runtime.sendMessage(command) as Promise<Reply<C>>;
}

/** Messages the background sends to a content script. */
export type TabMessage =
  | { type: 'role'; isPlayer: boolean }
  | { type: 'ping' }
  /** Read a playlist from the page's own origin: YouTube refuses its later pages to the extension (403). */
  | { type: 'playlist/read'; listId: string }
  /** The video ended at the Stop point: stay paused (cancel YouTube's autoplay). */
  | { type: 'stopped' };

/** Content script asks whether its tab is the player tab. */
export type RoleQuery = { type: 'tab/role' };
