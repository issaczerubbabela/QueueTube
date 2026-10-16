// The protocol between UI surfaces / content script and the background worker.
// UI surfaces never write queue state themselves; they send a Command (ADR 0001).
import browser from 'webextension-polyfill';
import type { Settings } from '../domain/queue';

export type Command =
  | { type: 'queue/add'; videoIds: string[] }
  | { type: 'queue/remove'; entryId: string }
  | { type: 'queue/move'; entryId: string; toIndex: number }
  | { type: 'queue/playNextInLine'; entryId: string }
  | { type: 'queue/clear' }
  | { type: 'queue/undo' }
  | { type: 'history/clear' }
  | { type: 'play/entry'; entryId: string }
  | { type: 'play/video'; videoId: string }
  | { type: 'play/next' }
  | { type: 'play/previous' }
  | { type: 'player/ended'; videoId: string | null }
  | { type: 'player/describe'; videoId: string; title: string; channel: string; durationSec: number | null }
  | { type: 'player/focus' }
  | { type: 'player/claimActiveTab' }
  | { type: 'tabs/gather' }
  | { type: 'tabs/openFree'; url: string }
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

export interface Replies {
  'tabs/gather': { gathered: number };
  'queue/add': { added: number };
  status: Status;
}

export type Reply<C extends Command> = C['type'] extends keyof Replies ? Replies[C['type']] : void;

export function send<C extends Command>(command: C): Promise<Reply<C>> {
  return browser.runtime.sendMessage(command) as Promise<Reply<C>>;
}

/** Messages the background sends to a content script. */
export type TabMessage = { type: 'role'; isPlayer: boolean } | { type: 'ping' };

/** Content script asks whether its tab is the player tab. */
export type RoleQuery = { type: 'tab/role' };
