// The extension side of page.ts: in the player tab, tells the page script which directions the
// queue can take, and turns its requests into Commands. Read-only on state (ADR 0001).
import browser from 'webextension-polyfill';
import { queueDirections } from '../domain/queue';
import { send } from '../shared/messages';
import { KEYS, readQueue, readSettings } from '../shared/state';

let isPlayer = false;

async function publish(): Promise<void> {
  const stored = await browser.storage.local.get([KEYS.queue, KEYS.settings]);
  const can = isPlayer ? queueDirections(readQueue(stored[KEYS.queue]), readSettings(stored[KEYS.settings])) : { next: false, previous: false };
  const root = document.documentElement;
  // Only write on change: the page script swaps media handlers whenever these change.
  for (const [key, on] of [['cueNext', can.next], ['cuePrevious', can.previous]] as const) {
    if ((root.dataset[key] === '1') !== on) {
      if (on) root.dataset[key] = '1';
      else delete root.dataset[key];
    }
  }
}

export function setMediaControlsRole(player: boolean): void {
  isPlayer = player;
  publish().catch(() => {});
}

export function listenForMediaControls(): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (KEYS.queue in changes || KEYS.settings in changes)) publish().catch(() => {});
  });
  window.addEventListener('cue-media', (event) => {
    if (!isPlayer) return;
    const direction = (event as CustomEvent).detail;
    if (direction === 'next') send({ type: 'play/next' }).catch(() => {});
    else if (direction === 'previous') send({ type: 'play/previous' }).catch(() => {});
  });
}
