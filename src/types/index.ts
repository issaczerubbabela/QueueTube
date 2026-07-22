export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  url: string;
  addedAt: number;
  watched: boolean;
  position: number;
}

export interface Settings {
  autoGather: boolean;
  allowDuplicates: boolean;
  autoRemovePlayed: boolean;
  autoFocusPlayer: boolean;
  queueLocation: 'right' | 'bottom' | 'floating';
  theme: 'system' | 'dark' | 'light';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

export interface QueueState {
  masterTabId: number | null;
  queue: QueueItem[];
  currentVideoId: string | null;
  history: QueueItem[];
  settings: Settings;
}

export type ExtensionMessage =
  | { type: 'GATHER_TABS' }
  | { type: 'ADD_TO_QUEUE'; videoUrl: string; focusMaster?: boolean }
  | { type: 'PLAY_VIDEO'; videoId: string }
  | { type: 'PLAY_NEXT' }
  | { type: 'PLAY_PREVIOUS' }
  | { type: 'REMOVE_FROM_QUEUE'; itemId: string }
  | { type: 'MOVE_QUEUE_ITEM'; fromIndex: number; toIndex: number }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'QUEUE_UPDATED'; state: QueueState };
