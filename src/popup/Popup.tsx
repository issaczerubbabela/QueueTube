import React, { useEffect } from 'react';
import { useQueueStore } from '../shared/store';
import {
  ListVideo,
  Layers,
  SkipForward,
  SkipBack,
  Trash2,
  Settings as SettingsIcon,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  PanelRight
} from 'lucide-react';

export const Popup: React.FC = () => {
  const store = useQueueStore();

  useEffect(() => {
    store.init();

    // Send CHECK_MASTER_TAB to background script
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'CHECK_MASTER_TAB' }, (response: any) => {
        if (response && response.state) {
          useQueueStore.setState({ ...response.state });
        } else if (response && response.masterTabId !== undefined) {
          useQueueStore.setState({ masterTabId: response.masterTabId });
        }
      });
    }
  }, []);

  const handleGatherTabs = () => {
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'GATHER_TABS' });
    }
  };

  const handleOpenPlayer = () => {
    const extApi = typeof browser !== 'undefined' ? browser : chrome;
    if (store.masterTabId !== null) {
      extApi.tabs.update(store.masterTabId, { active: true }).catch(() => {
        extApi.tabs.create({ url: 'https://www.youtube.com' });
      });
    } else {
      extApi.tabs.create({ url: 'https://www.youtube.com' });
    }
  };

  const handleOpenOptions = () => {
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.openOptionsPage) {
      runtime.openOptionsPage();
    }
  };

  const currentItem = store.queue.find((q) => q.videoId === store.currentVideoId);

  return (
    <div className="w-80 p-4 bg-yt-dark text-yt-text font-sans antialiased space-y-4 border border-yt-border/40 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-yt-red/10 border border-yt-red/30 shadow-glow">
            <ListVideo className="w-5 h-5 text-yt-red" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">QueueTube</h1>
            <p className="text-[11px] text-yt-muted">Single Player Queue</p>
          </div>
        </div>

        <button
          onClick={handleOpenOptions}
          className="p-2 text-yt-muted hover:text-white hover:bg-yt-hover rounded-lg transition-colors"
          title="Open Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Master Player Status */}
      <div
        onClick={handleOpenPlayer}
        className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/50 border border-white/5 hover:border-white/20 cursor-pointer transition-all group"
      >
        <div className="flex items-center gap-2">
          {store.masterTabId !== null ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          )}
          <div>
            <span className="text-xs font-semibold text-white group-hover:text-yt-red transition-colors">
              {store.masterTabId !== null ? 'Master Player Active' : 'No Player Active'}
            </span>
            <p className="text-[10px] text-yt-muted">
              {store.masterTabId !== null ? `Tab ID: ${store.masterTabId} (Click to focus)` : 'Open YouTube to activate'}
            </p>
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-yt-muted group-hover:text-white transition-colors" />
      </div>

      {/* Auto-gather Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/50 border border-white/5">
        <div>
          <span className="text-xs font-semibold text-white">Auto-gather Tabs</span>
          <p className="text-[10px] text-yt-muted">Automatically add new YouTube tabs</p>
        </div>
        <button
          onClick={() => store.setSettings({ autoGather: !store.settings.autoGather })}
          className={`w-10 h-5 rounded-full relative transition-colors ${
            store.settings.autoGather ? 'bg-yt-red' : 'bg-yt-paper border border-white/10'
          }`}
        >
          <div
            className={`absolute top-[1px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
              store.settings.autoGather ? 'translate-x-5' : 'translate-x-[1px] opacity-50'
            }`}
          />
        </button>
      </div>

      <div className="flex gap-2">
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => {
            const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
            if (runtime && runtime.sendMessage) {
              runtime.sendMessage({ type: 'TOGGLE_SIDEBAR' });
            }
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-yt-paper hover:bg-yt-hover border border-yt-border text-white text-xs font-semibold rounded-xl transition-all active:scale-98"
          title="Toggle Sidebar (Alt+Shift+L)"
        >
          <PanelRight className="w-4 h-4" />
          <span>Toggle Sidebar</span>
        </button>

        {/* Primary Action Button: Gather Tabs */}
        <button
          onClick={handleGatherTabs}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 bg-yt-red hover:bg-yt-redHover text-white text-xs font-semibold rounded-xl shadow-glow transition-all active:scale-98"
          title="Gather YouTube Tabs (Alt+Shift+Q)"
        >
          <Layers className="w-4 h-4" />
          <span>Gather Tabs</span>
        </button>
      </div>

      {/* Currently Playing Card */}
      {currentItem && (
        <div className="p-2.5 rounded-xl bg-yt-paper/40 border border-yt-border/50 space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-yt-red tracking-wider">Now Playing</span>
          <div className="flex gap-2 items-center">
            <img
              src={currentItem.thumbnail}
              alt={currentItem.title}
              className="w-14 h-9 object-cover rounded bg-black/40"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-medium text-white truncate">{currentItem.title}</h4>
              <p className="text-[11px] text-yt-muted truncate">{currentItem.channel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Media & Queue Control Toolbar */}
      <div className="flex items-center justify-between p-2 rounded-xl bg-yt-paper/30 border border-white/5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => store.playPrevious()}
            disabled={store.history.length === 0}
            className="p-2 text-yt-muted hover:text-white disabled:opacity-30 disabled:hover:text-yt-muted rounded-lg transition-colors"
            title="Previous Video (Alt+Shift+P)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => store.playNext()}
            disabled={store.queue.length === 0}
            className="p-2 text-yt-muted hover:text-white disabled:opacity-30 disabled:hover:text-yt-muted rounded-lg transition-colors"
            title="Next Video (Alt+Shift+N)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-yt-muted font-mono px-2">
          {store.queue.length} in queue
        </div>

        {store.queue.length > 0 && (
          <button
            onClick={() => store.clearQueue()}
            className="p-2 text-yt-muted hover:text-red-400 rounded-lg transition-colors"
            title="Clear Queue"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
