import React, { useEffect, useRef, useState } from 'react';
import { useQueueStore } from '../shared/store';
import { SidebarItem } from './SidebarItem';
import {
  ListVideo,
  Layers,
  ChevronRight,
  ChevronLeft,
  History,
  Sparkles,
  Settings as SettingsIcon,
  RotateCcw,
  Download,
  Upload
} from 'lucide-react';

export const QueueSidebar: React.FC = () => {
  const store = useQueueStore();
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [isResizing, setIsResizing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    store.init();
  }, []);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    store.moveQueueItem(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleGatherTabs = () => {
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'GATHER_TABS' });
    }
  };

  const handleExportQueue = () => {
    const lines = store.queue.map((item) => `${item.title}\t${item.url}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `queuetube-queue-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportQueue = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedCount = await store.importQueueFromText(text);
      setImportStatus(importedCount > 0 ? `Imported ${importedCount}` : 'No new videos');
    } catch (e) {
      setImportStatus('Import failed');
    } finally {
      event.target.value = '';
      setTimeout(() => setImportStatus(null), 2500);
    }
  };

  const currentItem = store.queue.find((q) => q.videoId === store.currentVideoId);

  // Resize handler
  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth >= 280 && newWidth <= 600) {
        store.setSettings({ sidebarWidth: newWidth });
      }
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (store.settings.sidebarCollapsed) {
    return (
      <div className="fixed right-0 top-20 z-50">
        <button
          onClick={() => store.setSettings({ sidebarCollapsed: false })}
          className="flex items-center gap-2 bg-yt-paper border border-yt-border/80 hover:bg-yt-hover text-white px-3 py-2.5 rounded-l-2xl shadow-panel transition-all group"
          title="Open QueueTube Sidebar (Ctrl+Shift+L)"
        >
          <div className="relative">
            <ListVideo className="w-5 h-5 text-yt-red group-hover:scale-110 transition-transform" />
            {store.queue.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-yt-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse-glow">
                {store.queue.length}
              </span>
            )}
          </div>
          <ChevronLeft className="w-4 h-4 text-yt-muted group-hover:text-white" />
        </button>
      </div>
    );
  }

  return (
    <aside
      style={{ width: '100%' }}
      className="relative flex flex-col max-h-[calc(100vh-80px)] bg-yt-dark text-yt-text border border-yt-border/60 rounded-xl shadow-panel transition-all select-none overflow-hidden"
    >
      {/* Resizable Drag Border */}
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yt-red/60 transition-colors ${
          isResizing ? 'bg-yt-red' : 'bg-transparent'
        }`}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-yt-border/50 bg-yt-paper/50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-yt-red/10 border border-yt-red/30">
            <ListVideo className="w-5 h-5 text-yt-red" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold tracking-tight text-white">QueueTube</h2>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 bg-white/10 text-yt-muted rounded">
                Master
              </span>
            </div>
            <p className="text-[11px] text-yt-muted">
              {store.queue.length} {store.queue.length === 1 ? 'video' : 'videos'} queued
              {importStatus && <span className="ml-1 text-yt-red">• {importStatus}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleGatherTabs}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-yt-red hover:bg-yt-redHover text-white text-xs font-medium rounded-lg shadow-glow transition-all"
            title="Gather all open YouTube tabs (Ctrl+Shift+Q)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Gather</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleImportQueue}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-yt-muted hover:text-white hover:bg-yt-hover rounded-lg transition-colors"
            title="Import queue from .txt"
          >
            <Upload className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportQueue}
            disabled={store.queue.length === 0}
            className="p-1.5 text-yt-muted hover:text-white hover:bg-yt-hover disabled:opacity-40 disabled:hover:text-yt-muted rounded-lg transition-colors"
            title="Save queue to .txt"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => store.setSettings({ sidebarCollapsed: true })}
            className="p-1.5 text-yt-muted hover:text-white hover:bg-yt-hover rounded-lg transition-colors"
            title="Collapse Sidebar (Ctrl+Shift+L)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex border-b border-yt-border/40 px-3 bg-yt-paper/30">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-yt-red text-white'
              : 'border-transparent text-yt-muted hover:text-yt-text'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Up Next ({store.queue.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-yt-red text-white'
              : 'border-transparent text-yt-muted hover:text-yt-text'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>History ({store.history.length})</span>
        </button>

        {store.queue.length > 0 && activeTab === 'queue' && (
          <button
            onClick={() => store.clearQueue()}
            className="ml-auto text-[11px] text-yt-muted hover:text-red-400 px-2 py-1 transition-colors"
            title="Clear all queued videos"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'queue' ? (
          <>
            {/* Currently Playing Card */}
            {currentItem && (
              <div className="p-2.5 rounded-xl bg-yt-red/10 border border-yt-red/30 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-yt-red font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yt-red animate-ping" />
                    Now Playing
                  </span>
                </div>
                <div className="flex gap-2.5 items-center">
                  <img
                    src={currentItem.thumbnail}
                    alt={currentItem.title}
                    className="w-16 h-10 object-cover rounded-md bg-black/50"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-semibold text-white truncate">{currentItem.title}</h3>
                    <p className="text-[11px] text-yt-muted truncate">{currentItem.channel}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Queue Drag & Drop List */}
            {store.queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-3 text-yt-muted my-10">
                <div className="p-4 rounded-full bg-yt-paper/60 border border-white/5">
                  <ListVideo className="w-8 h-8 text-yt-muted/60" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Your queue is empty</h4>
                  <p className="text-xs text-yt-muted mt-1 max-w-[220px]">
                    Open YouTube videos in new tabs or click <b>Gather</b> to collect tabs into QueueTube.
                  </p>
                </div>
                <button
                  onClick={handleGatherTabs}
                  className="px-3 py-1.5 bg-yt-paper hover:bg-yt-hover border border-yt-border text-xs text-white rounded-lg transition-colors"
                >
                  Gather Open Tabs
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 min-h-[100px] max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {store.queue.map((item, idx) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    index={idx}
                    isCurrent={item.videoId === store.currentVideoId}
                    onPlay={(videoId) => store.playVideo(videoId)}
                    onRemove={(id) => store.removeQueueItem(id)}
                    totalItems={store.queue.length}
                    isDragged={draggedIndex === idx}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* History View */
          <div className="space-y-2">
            {store.history.length === 0 ? (
              <div className="text-center py-10 text-xs text-yt-muted">
                No watch history yet in this session.
              </div>
            ) : (
              store.history.map((item, idx) => (
                <div
                  key={`${item.id}_hist_${idx}`}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-yt-paper/30 border border-white/5 hover:bg-yt-paper transition-colors"
                >
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-16 h-10 object-cover rounded-md bg-black/40"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-medium text-white truncate">{item.title}</h4>
                    <p className="text-[11px] text-yt-muted truncate">{item.channel}</p>
                  </div>
                  <button
                    onClick={() => store.playVideo(item.videoId)}
                    className="p-1.5 text-yt-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Replay video"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="p-2.5 border-t border-yt-border/40 bg-yt-paper/40 flex items-center justify-between text-[11px] text-yt-muted">
        <span>QueueTube v1.0</span>
        <button
          onClick={() => {
            const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
            if (runtime && runtime.openOptionsPage) {
              runtime.openOptionsPage();
            }
          }}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </footer>
    </aside>
  );
};
