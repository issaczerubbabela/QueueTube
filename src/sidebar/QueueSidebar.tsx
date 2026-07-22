import React, { useEffect, useRef, useState } from 'react';
import { useQueueStore } from '../shared/store';
import { SidebarItem } from './SidebarItem';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  History,
  Sparkles,
  Settings as SettingsIcon,
  RotateCcw,
  Upload,
  Download,
  ListPlus,
  ListVideo,
  MoreVertical,
} from 'lucide-react';

export const QueueSidebar: React.FC = () => {
  const store = useQueueStore();
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [isResizing, setIsResizing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Drag state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    store.init();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const path = e.composedPath();
      if (menuRef.current && !path.includes(menuRef.current) && menuButtonRef.current && !path.includes(menuButtonRef.current)) {
        setHeaderMenuOpen(false);
      }
    };
    const queueScrollContainer = document.getElementById('queue-scroll-container');
    if (headerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
      if (queueScrollContainer) queueScrollContainer.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (queueScrollContainer) queueScrollContainer.style.overflow = '';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
      if (queueScrollContainer) queueScrollContainer.style.overflow = '';
    };
  }, [headerMenuOpen]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = (_e: React.DragEvent) => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== index) {
      store.moveQueueItem(draggingIndex, index);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleGatherTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHeaderMenuOpen(false);
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'GATHER_TABS' });
    }
  };

  const handleExportQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHeaderMenuOpen(false);
    if (store.queue.length === 0) return;
    const lines = store.queue.map((item) => `${item.title}\t${item.url}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `queue-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportQueue = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setHeaderMenuOpen(false);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importedCount = await store.importQueueFromText(text);
      setImportStatus(importedCount > 0 ? `+${importedCount} added` : 'No new videos');
    } catch (e) {
      setImportStatus('Import failed');
    } finally {
      event.target.value = '';
      setTimeout(() => setImportStatus(null), 2500);
    }
  };



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

  const currentIndex = store.queue.findIndex((q) => q.videoId === store.currentVideoId);
  const currentPosition = currentIndex >= 0 ? currentIndex + 1 : (store.queue.length > 0 ? 1 : 0);
  const total = store.queue.length;
  const positionLabel = total > 0 ? `${currentPosition} / ${total}` : '0/0';
  const nextIndex = currentIndex >= 0 && currentIndex < store.queue.length - 1 ? currentIndex + 1 : 0;
  const nextItem = store.queue.length > 0 ? store.queue[nextIndex] : null;

  // ── COLLAPSED STATE ─────────────────────────────────────────────────────────
  if (store.settings.sidebarCollapsed) {
    return (
      <div
        style={{ width: '100%' }}
        className="bg-yt-dark border border-yt-border/60 rounded-[1.2rem] shadow-panel select-none mb-[1.6rem] overflow-hidden"
      >
        <div className="flex items-center justify-between px-[1.6rem] py-[1.2rem] bg-[#202020]">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-[0.8rem]">
              <span className="text-[1.9rem] font-bold text-white/90 leading-none whitespace-nowrap">Global Queue</span>
              <span className="text-[1.3rem] font-light text-yt-muted">{positionLabel}</span>
            </div>
            {nextItem && (
              <p className="text-[1.2rem] text-yt-muted mt-[0.4rem] truncate">
                Next: <span className="text-yt-text">{nextItem.title}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => store.setSettings({ sidebarCollapsed: false })}
            className="ml-[1.2rem] flex-shrink-0 p-[0.6rem] text-yt-muted hover:text-white hover:bg-yt-hover rounded-full transition-colors"
            title="Expand Queue (Alt+Shift+L)"
          >
            <ChevronDown className="w-[2rem] h-[2rem]" />
          </button>
        </div>

        {nextItem && (
          <div
            className="flex items-center gap-[1.2rem] px-[1.6rem] pb-[1.2rem] pt-[0.8rem] bg-[#202020] cursor-pointer group"
            onClick={() => store.playVideo(nextItem.videoId)}
          >
            <img
              src={nextItem.thumbnail}
              alt={nextItem.title}
              className="w-[10rem] h-[5.6rem] object-cover rounded-[0.8rem] flex-shrink-0 bg-black/40 group-hover:opacity-80 transition-opacity"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${nextItem.videoId}/hqdefault.jpg`;
              }}
            />
            <div className="min-w-0">
              <p className="text-[1.4rem] font-medium text-yt-text line-clamp-2 leading-[2rem] group-hover:text-yt-red transition-colors">
                {nextItem.title}
              </p>
              <p className="text-[1.2rem] text-yt-muted truncate mt-[0.2rem]">{nextItem.channel}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── EXPANDED STATE ───────────────────────────────────────────────────────────
  return (
    <aside
      style={{ width: '100%' }}
      className="relative flex flex-col max-h-[calc(100vh-140px)] bg-yt-dark text-yt-text border border-yt-border/60 rounded-[1.2rem] shadow-panel transition-all select-none overflow-hidden"
    >
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-[0.6rem] cursor-col-resize hover:bg-yt-red/60 transition-colors ${isResizing ? 'bg-yt-red' : 'bg-transparent'
          }`}
      />

      <header className="px-[1.6rem] py-[1.2rem] border-b border-yt-border/50 bg-[#202020] flex-shrink-0 relative z-50">
        <div className="flex items-start justify-between">
          <div className="flex flex-col mt-[0.4rem]">
            <h2 className="text-[1.9rem] font-bold text-white/90 leading-none whitespace-nowrap">Global Queue</h2>
            <span className="text-[1.3rem] text-yt-muted font-light mt-[0.6rem]">
              {positionLabel}
            </span>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-[0.2rem]">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleImportQueue}
              />

              {/* Header Meatball Menu Button */}
              <button
                ref={menuButtonRef}
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                className={`p-[0.6rem] hover:text-white rounded-full transition-colors ${headerMenuOpen ? 'text-white bg-white/10' : 'text-yt-text hover:bg-white/10'
                  }`}
              >
                <MoreVertical className="w-[2rem] h-[2rem]" />
              </button>

              <button
                onClick={() => store.setSettings({ sidebarCollapsed: true })}
                title="Collapse Sidebar (Alt+Shift+L)"
                className="p-[0.6rem] text-yt-text hover:text-white hover:bg-white/10 rounded-full transition-colors ml-[0.2rem]"
              >
                <ChevronUp className="w-[2rem] h-[2rem]" />
              </button>
            </div>

            {store.queue.length > 0 && activeTab === 'queue' && (
              <button
                onClick={() => store.clearQueue()}
                className="text-[1.3rem] uppercase font-medium text-white hover:bg-white/10 px-[0.8rem] py-[0.4rem] rounded-full transition-colors tracking-wide mt-[0.2rem] mr-[0.2rem]"
                title="Clear all queued videos"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Status Text (if import succeeds/fails) */}
        {importStatus && (
          <p className="text-[1.2rem] text-yt-red mt-[0.4rem]">{importStatus}</p>
        )}

        {/* Meatball Menu Dropdown */}
        {headerMenuOpen && (
          <div
            ref={menuRef}
            className="absolute right-[4rem] top-[4rem] w-[22rem] bg-[#282828] border border-white/10 rounded-[1.2rem] shadow-xl py-[0.8rem] z-[100] flex flex-col overflow-hidden"
          >
            <button
              onClick={handleGatherTabs}
              className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left"
            >
              <Layers className="w-[1.8rem] h-[1.8rem]" />
              Gather Tabs
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHeaderMenuOpen(false);
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left"
            >
              <Upload className="w-[1.8rem] h-[1.8rem]" />
              Import Queue
            </button>
            <button
              onClick={handleExportQueue}
              disabled={store.queue.length === 0}
              className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Download className="w-[1.8rem] h-[1.8rem]" />
              Export Queue
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHeaderMenuOpen(false);
                if (store.queue.length === 0) return;
                const ids = store.queue.slice(0, 50).map((item) => item.videoId).join(',');
                const url = `https://www.youtube.com/watch_videos?video_ids=${ids}`;
                const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
                runtime.sendMessage({ type: 'OPEN_NEW_TAB', url });
              }}
              disabled={store.queue.length === 0}
              className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ListPlus className="w-[1.8rem] h-[1.8rem]" />
              Save as Playlist
            </button>
            <div className="h-[1px] bg-white/10 my-[0.4rem] w-full" />
            <button
              onClick={() => {
                setHeaderMenuOpen(false);
                const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
                runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' });
              }}
              className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left"
            >
              <SettingsIcon className="w-[1.8rem] h-[1.8rem]" />
              Settings
            </button>
          </div>
        )}
      </header>

      {/* ── Navigation Tabs ── */}
      {store.settings.autoRemovePlayed && (
        <div className="flex border-b border-yt-border/40 px-[1.2rem] bg-yt-paper/30 flex-shrink-0">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex justify-center items-center gap-[0.8rem] px-[1.2rem] py-[0.8rem] text-[1.4rem] font-medium border-b-2 transition-colors ${activeTab === 'queue'
              ? 'border-yt-red text-white'
              : 'border-transparent text-yt-muted hover:text-yt-text'
              }`}
          >
            <Sparkles className="w-[1.4rem] h-[1.4rem]" />
            <span>Up Next ({store.queue.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex justify-center items-center gap-[0.8rem] px-[1.2rem] py-[0.8rem] text-[1.4rem] font-medium border-b-2 transition-colors ${activeTab === 'history'
              ? 'border-yt-red text-white'
              : 'border-transparent text-yt-muted hover:text-yt-text'
              }`}
          >
            <History className="w-[1.4rem] h-[1.4rem]" />
            <span>History ({store.history.length})</span>
          </button>
        </div>
      )}

      {/* Main Content Area (No horizontal padding to be flush with edges) */}
      <div id="queue-scroll-container" className="flex-1 overflow-y-auto min-h-0 pb-[0.8rem]">
        {!store.settings.autoRemovePlayed || activeTab === 'queue' ? (
          <>
            {store.queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-[3.2rem] space-y-[1.2rem] text-yt-muted my-[4rem]">
                <div className="p-[1.6rem] rounded-full bg-yt-paper/60 border border-white/5">
                  <ListVideo className="w-[3.2rem] h-[3.2rem] text-yt-muted/60" />
                </div>
                <div>
                  <h4 className="text-[1.4rem] font-semibold text-white">Your queue is empty</h4>
                  <p className="text-[1.2rem] text-yt-muted mt-[0.4rem] max-w-[22rem] leading-snug">
                    Open YouTube videos in new tabs or click <b>Gather Tabs</b> to collect them.
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    handleGatherTabs(e);
                  }}
                  className="px-[1.2rem] py-[0.6rem] bg-white/5 hover:bg-white/10 border border-white/10 text-[1.2rem] text-white rounded-[0.8rem] transition-colors mt-[0.8rem]"
                >
                  Gather Open Tabs
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                {store.queue.map((item, idx) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    index={idx}
                    isCurrent={item.videoId === store.currentVideoId}
                    onPlay={(videoId) => store.playVideo(videoId)}
                    onRemove={(id) => store.removeQueueItem(id)}
                    isDragging={draggingIndex === idx}
                    isDragOver={dragOverIndex === idx}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-[0.4rem] px-[0.8rem]">
            {store.history.length === 0 ? (
              <div className="text-center py-[4rem] text-[1.2rem] text-yt-muted">
                No watch history yet in this session.
              </div>
            ) : (
              store.history.map((item, idx) => (
                <div
                  key={`${item.id}_hist_${idx}`}
                  className="flex items-center gap-[0.8rem] py-[0.8rem] pr-[0.8rem] transition-colors hover:bg-[#272727]"
                >
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-[10rem] h-[5.6rem] object-cover rounded-[0.8rem] bg-black/40 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-center ml-[0.4rem]">
                    <h4 className="text-[1.4rem] font-medium text-white line-clamp-2 leading-[2rem]">{item.title}</h4>
                    <p className="text-[1.2rem] text-yt-muted truncate mt-[0.2rem]">{item.channel}</p>
                  </div>
                  <button
                    onClick={() => store.playVideo(item.videoId)}
                    className="p-[0.6rem] text-yt-muted hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                    title="Replay video"
                  >
                    <RotateCcw className="w-[1.6rem] h-[1.6rem]" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
