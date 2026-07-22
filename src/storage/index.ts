import { QueueItem, QueueState, Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  autoGather: true,
  allowDuplicates: false,
  autoRemovePlayed: false,
  autoFocusPlayer: true,
  queueLocation: 'right',
  theme: 'dark',
  sidebarWidth: 380,
  sidebarCollapsed: false,
};

export const DEFAULT_STATE: QueueState = {
  masterTabId: null,
  queue: [],
  currentVideoId: null,
  history: [],
  settings: DEFAULT_SETTINGS,
};

const getStorage = () => {
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser.storage.local;
  }
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.local;
  }
  return null;
};

export async function getQueueState(): Promise<QueueState> {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_STATE;
  }
  const res = (await storage.get(['queueState'])) as { queueState?: QueueState };
  if (!res || !res.queueState) {
    // Return default state directly without calling saveQueueState to avoid infinite recursion
    return DEFAULT_STATE;
  }
  return {
    ...DEFAULT_STATE,
    ...res.queueState,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(res.queueState.settings || {})
    }
  };
}

export async function saveQueueState(newState: Partial<QueueState>): Promise<QueueState> {
  const currentState = await getQueueState();
  const updated: QueueState = {
    ...currentState,
    ...newState,
    settings: {
      ...currentState.settings,
      ...(newState.settings || {})
    }
  };

  const storage = getStorage();
  if (storage) {
    await storage.set({ queueState: updated });
  }

  // Broadcast state to runtime if in extension context
  try {
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'QUEUE_UPDATED', state: updated }).catch(() => {});
    }
  } catch (e) {
    // Ignore runtime messaging errors if no listeners
  }

  return updated;
}

export async function addToQueue(
  item: Omit<QueueItem, 'id' | 'addedAt' | 'position' | 'watched'>
): Promise<QueueState> {
  const state = await getQueueState();

  // Check duplicate setting
  if (!state.settings.allowDuplicates) {
    const exists = state.queue.some((q) => q.videoId === item.videoId);
    if (exists) {
      return state;
    }
  }

  const newItem: QueueItem = {
    ...item,
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    addedAt: Date.now(),
    watched: false,
    position: state.queue.length
  };

  const newQueue = [...state.queue, newItem];

  // If no video is playing currently, set this as current
  const currentVideoId = state.currentVideoId || newItem.videoId;

  return await saveQueueState({
    queue: newQueue,
    currentVideoId
  });
}

export async function removeFromQueue(itemId: string): Promise<QueueState> {
  const state = await getQueueState();
  const newQueue = state.queue.filter((item) => item.id !== itemId);
  return await saveQueueState({ queue: newQueue });
}

export async function moveQueueItem(fromIndex: number, toIndex: number): Promise<QueueState> {
  const state = await getQueueState();
  if (fromIndex < 0 || fromIndex >= state.queue.length || toIndex < 0 || toIndex >= state.queue.length) {
    return state;
  }

  const newQueue = [...state.queue];
  const [moved] = newQueue.splice(fromIndex, 1);
  newQueue.splice(toIndex, 0, moved);

  // Update position property
  const reindexed = newQueue.map((item, idx) => ({ ...item, position: idx }));

  return await saveQueueState({ queue: reindexed });
}

export async function clearQueue(): Promise<QueueState> {
  return await saveQueueState({ queue: [] });
}

export async function updateSettings(settings: Partial<Settings>): Promise<QueueState> {
  const state = await getQueueState();
  const updatedSettings = { ...state.settings, ...settings };
  return await saveQueueState({ settings: updatedSettings });
}

export function subscribeQueueState(callback: (state: QueueState) => void): () => void {
  const listener = (changes: any, areaName: string) => {
    if (areaName === 'local' && changes.queueState && changes.queueState.newValue) {
      callback(changes.queueState.newValue);
    }
  };

  const storageOnChanged =
    typeof browser !== 'undefined' && browser.storage
      ? browser.storage.onChanged
      : typeof chrome !== 'undefined' && chrome.storage
      ? chrome.storage.onChanged
      : null;

  if (storageOnChanged) {
    storageOnChanged.addListener(listener);
    return () => storageOnChanged.removeListener(listener);
  }

  return () => {};
}
