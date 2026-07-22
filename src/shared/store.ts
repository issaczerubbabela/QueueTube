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
import { buildWatchUrl, extractVideoId } from '../utils/youtube';

interface QueueStore extends QueueState {
  isInitialized: boolean;
  init: () => Promise<void>;
  addVideoUrl: (url: string, focusMaster?: boolean) => Promise<void>;
  removeQueueItem: (itemId: string) => Promise<void>;
  moveQueueItem: (fromIndex: number, toIndex: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  importQueueFromText: (text: string) => Promise<number>;
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

    // Listen for storage changes across extension components
    subscribeQueueState((newState) => {
      set({ ...newState });
    });

    // Listen for runtime messaging updates
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((msg: any) => {
        if (msg && msg.type === 'QUEUE_UPDATED' && msg.state) {
          set({ ...msg.state });
        }
      });
    }
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

  importQueueFromText: async (text: string) => {
    const matches = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?[^\s<>"']*v=|youtu\.be\/|youtube\.com\/shorts\/)[^\s<>"']+/gi) || [];
    const videoIds = Array.from(
      new Set(
        matches
          .map((url) => extractVideoId(url))
          .filter((videoId): videoId is string => Boolean(videoId))
      )
    );

    let importedCount = 0;
    for (const videoId of videoIds) {
      const url = buildWatchUrl(videoId);
      const beforeLength = get().queue.length;
      const meta = await fetchVideoMetadata(url);
      const updated = await apiAddToQueue({
        videoId,
        title: meta.title || `Video (${videoId})`,
        channel: meta.channel || 'YouTube',
        duration: meta.duration || '--:--',
        thumbnail: meta.thumbnail || '',
        url
      });
      set({ ...updated });
      if (updated.queue.length > beforeLength) importedCount += 1;
    }

    return importedCount;
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
    const updated = await saveQueueState({
      currentVideoId: videoId
    });
    set({ ...updated });

    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'PLAY_VIDEO', videoId }).catch(() => {});
    }
  },

  playNext: async () => {
    const state = get();
    if (state.queue.length === 0) return;

    const currentIndex = state.queue.findIndex((item) => item.videoId === state.currentVideoId);
    const nextIndex = currentIndex >= 0 && currentIndex < state.queue.length - 1 ? currentIndex + 1 : 0;
    const nextItem = state.queue[nextIndex];

    let nextQueue = state.queue;
    let nextHistory = state.history;
    const currentItem = currentIndex >= 0 ? state.queue[currentIndex] : null;

    if (currentItem && state.settings.autoRemovePlayed) {
      nextQueue = state.queue.filter((item) => item.id !== currentItem.id);
      nextHistory = [currentItem, ...state.history];
    }

    const updated = await saveQueueState({
      currentVideoId: nextItem.videoId,
      queue: nextQueue,
      history: nextHistory
    });
    set({ ...updated });

    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'PLAY_VIDEO', videoId: nextItem.videoId }).catch(() => {});
    }
  },

  playPrevious: async () => {
    const state = get();
    if (state.history.length === 0) return;
    const prevItem = state.history[0];
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
