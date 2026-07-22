import React, { useState, useRef, useEffect } from 'react';
import { QueueItem } from '../types';
import { Trash2, ExternalLink, Share, MoreVertical, Play } from 'lucide-react';

interface SidebarItemProps {
  item: QueueItem;
  index: number;
  isCurrent: boolean;
  onPlay: (videoId: string) => void;
  onRemove: (id: string) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  item,
  index,
  isCurrent,
  onPlay,
  onRemove,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const path = e.composedPath();
      if (menuRef.current && !path.includes(menuRef.current) && buttonRef.current && !path.includes(buttonRef.current)) {
        setMenuOpen(false);
      }
    };
    const queueScrollContainer = document.getElementById('queue-scroll-container');
    if (menuOpen) {
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
  }, [menuOpen]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setMenuOpen(false);
    }, 1500);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          url: item.url,
        });
        setMenuOpen(false);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          handleCopy(e);
        } else {
          setMenuOpen(false);
        }
      }
    } else {
      handleCopy(e);
    }
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position fixed relative to viewport to escape overflow constraints
      let topPos = rect.bottom + 4;
      // If menu goes off bottom of screen, show above button
      if (topPos + 160 > window.innerHeight) {
        topPos = rect.top - 164;
      }
      setMenuPos({ top: topPos, right: window.innerWidth - rect.right });
    }
    setMenuOpen(!menuOpen);
  };

  const showDuration =
    item.duration &&
    item.duration !== '--:--' &&
    item.duration !== 'YouTube' &&
    item.duration.trim() !== '';

  return (
    <div
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className="flex flex-col relative"
    >
      {/* "Make Space" Placeholder when dragging over this item */}
      <div
        className={`transition-all duration-300 ease-in-out w-full border-t-2 border-yt-red ${isDragOver && !isDragging ? 'h-[7.2rem] opacity-100 mb-[0.4rem]' : 'h-0 opacity-0 border-transparent mb-0'}`}
      />

      <div
        draggable
        onDragStart={(e) => {
          setMenuOpen(false);
          onDragStart(e, index);
        }}
        onDragEnd={onDragEnd}
        className={`group relative flex items-center gap-[0.4rem] py-[0.4rem] px-[0.4rem] transition-colors duration-200 select-none ${isDragging
          ? 'opacity-40'
          : isCurrent
            ? 'bg-[#311607]'
            : 'bg-transparent hover:bg-[#272727]'
          }`}
      >
        {/* Drag Handle or Play Icon */}
        <div
          className={`w-[2.4rem] flex justify-center items-center flex-shrink-0 text-yt-muted ${isCurrent ? 'text-white' : 'cursor-grab active:cursor-grabbing hover:text-white'
            }`}
        >
          {isCurrent ? (
            <Play className="w-[1.6rem] h-[1.6rem] fill-white/40" style={{ border: "none", outline: "none" }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[2.4rem] h-[2.4rem] opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M21,10H3V9h18V10z M21,14H3v1h18V14z" />
            </svg>
          )}
        </div>

        {/* Thumbnail — exactly 100x56 proportional, scaling with rem */}
        <div
          className="relative w-[10rem] h-[5.6rem] flex-shrink-0 rounded-[0.8rem] overflow-hidden cursor-pointer bg-black/40"
          onClick={() => onPlay(item.videoId)}
        >
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover hover:opacity-80 transition-opacity duration-200"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
            }}
          />
          {showDuration && (
            <span className="absolute bottom-[0.4rem] right-[0.4rem] px-[0.4rem] py-[0.2rem] bg-black/80 text-[1.2rem] leading-none text-white font-medium rounded-[0.4rem]">
              {item.duration}
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-[0.4rem] ml-[0.4rem]">
          <h4
            onClick={() => onPlay(item.videoId)}
            className={`text-[1.4rem] font-medium line-clamp-2 leading-[2rem] cursor-pointer hover:text-white transition-colors ${isCurrent ? 'text-white' : 'text-yt-text'
              }`}
            title={item.title}
          >
            {item.title}
          </h4>
          <p className={`text-[1.2rem] truncate ${isCurrent ? 'text-white/70' : 'text-yt-muted'}`}>
            {item.channel}
          </p>
        </div>

        {/* Meatball Menu */}
        <div className="relative flex-shrink-0">
          <button
            ref={buttonRef}
            onClick={handleMenuToggle}
            className={`p-[0.6rem] hover:text-white rounded-full transition-colors ${menuOpen ? 'opacity-100 text-white bg-white/10' : 'opacity-0 group-hover:opacity-100 text-yt-text hover:bg-white/10'
              }`}
          >
            <MoreVertical className="w-[1.8rem] h-[1.8rem]" />
          </button>
        </div>
      </div>

      {/* Fixed Portal-like Menu to escape overflow:hidden/auto */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="w-[20rem] bg-[#282828] border border-white/10 rounded-[1.2rem] shadow-xl py-[0.8rem] z-[9999] flex flex-col overflow-hidden"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
              runtime.sendMessage({ type: 'OPEN_NEW_TAB', url: item.url + (item.url.includes('?') ? '&' : '?') + 'queueTubeBypass=1' });
            }}
            className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors cursor-pointer w-full text-left"
          >
            <ExternalLink className="w-[1.8rem] h-[1.8rem]" />
            Open in new tab
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left"
          >
            <Share className="w-[1.8rem] h-[1.8rem]" />
            {copied ? 'Link Copied!' : 'Share'}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onRemove(item.id);
            }}
            className="flex items-center gap-[1.6rem] px-[1.6rem] py-[1rem] text-[1.4rem] text-yt-text hover:bg-white/10 transition-colors w-full text-left"
          >
            <Trash2 className="w-[1.8rem] h-[1.8rem]" />
            Remove from queue
          </button>
        </div>
      )}
    </div>
  );
};
