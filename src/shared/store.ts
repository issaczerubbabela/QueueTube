import { create } from 'zustand';
import { QueueState, Settings, QueueItem } from '../types';
import {
  DEFAULT_STATE,
  getQueueState,
  saveQueueState,
  addToQueue as apiAddToQueue,
  removeFromQueue as apiRemoveFromQueue,
  moveQueueItem as apiMoveQueueItem,
  clearQueue as apiClearQueue,
  updateSettings as apiUpdateSettings,
  subscribeQueueState
} from '../storage';
import { fetchVideoMetadata } from '../utils/youtube';

interface QueueStore extends QueueState {
  isInitialized: boolean;
  init: () => Promise<void>;
  addVideoUrl: (url: string, focusMaster?: boolean) => Promise<void>;
  removeQueueItem: (itemId: string) => Promise<void>;
  moveQueueItem: (fromIndex: number, toIndex: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  setSettings: (settings: Partial<Settings>) => Promise<void>;
  playVideo: (videoId: string) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  setCurrentVideoId: (videoId: string | null) => Promise<void>;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  ...DEFAULT_STATE,
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    const initial = await getQueueState();
    set({ ...initial, isInitialized: true });

    // Listen for changes across extension components
    subscribeQueueState((newState) => {
      set({ ...newState });
    });
  },

  addVideoUrl: async (url: string, focusMaster = true) => {
    const meta = await fetchVideoMetadata(url);
    if (meta.videoId) {
      const updated = await apiAddToQueue({
        videoId: meta.videoId,
        title: meta.title || `Video (${meta.videoId})`,
        channel: meta.channel || 'YouTube',
        duration: meta.duration || '--:--',
        thumbnail: meta.thumbnail || '',
        url: meta.url || url
      });
      set({ ...updated });
    }
  },

  removeQueueItem: async (itemId: string) => {
    const updated = await apiRemoveFromQueue(itemId);
    set({ ...updated });
  },

  moveQueueItem: async (fromIndex: number, toIndex: number) => {
    const updated = await apiMoveQueueItem(fromIndex, toIndex);
    set({ ...updated });
  },

  clearQueue: async () => {
    const updated = await apiClearQueue();
    set({ ...updated });
  },

  setSettings: async (settings: Partial<Settings>) => {
    const updated = await apiUpdateSettings(settings);
    set({ ...updated });
  },

  setCurrentVideoId: async (videoId: string | null) => {
    const updated = await saveQueueState({ currentVideoId: videoId });
    set({ ...updated });
  },

  playVideo: async (videoId: string) => {
    const state = get();
    // Move current video to history if autoRemovePlayed is true
    const item = state.queue.find((q) => q.videoId === videoId);
    let newQueue = state.queue;
    let newHistory = state.history;

    if (item && state.settings.autoRemovePlayed) {
      newQueue = state.queue.filter((q) => q.id !== item.id);
      newHistory = [item, ...state.history];
    }

    const updated = await saveQueueState({
      currentVideoId: videoId,
      queue: newQueue,
      history: newHistory
    });
    set({ ...updated });

    // Send command to runtime to play video
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'PLAY_VIDEO', videoId }).catch(() => {});
    }
  },

  playNext: async () => {
    const state = get();
    if (state.queue.length === 0) return;
    const nextItem = state.queue[0];
    await get().playVideo(nextItem.videoId);
  },

  playPrevious: async () => {
    const state = get();
    if (state.history.length === 0) return;
    const prevItem = state.history[0];
    // Push current back to queue front, play prevItem
    const updated = await saveQueueState({
      currentVideoId: prevItem.videoId,
      history: state.history.slice(1)
    });
    set({ ...updated });

    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'PLAY_VIDEO', videoId: prevItem.videoId }).catch(() => {});
    }
  }
}));
