import React from 'react';
import { QueueItem } from '../types';
import { Play, Trash2, Copy, ExternalLink, GripVertical } from 'lucide-react';

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
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine if the duration badge should be shown (exclude placeholder values)
  const showDuration =
    item.duration &&
    item.duration !== '--:--' &&
    item.duration !== 'YouTube' &&
    item.duration.trim() !== '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, index)}
      className={`group relative flex items-center gap-2 p-2.5 rounded-xl transition-all duration-200 select-none ${
        isDragging
          ? 'opacity-40 scale-95'
          : isDragOver
          ? 'bg-yt-red/20 border border-yt-red/50 scale-[1.01]'
          : isCurrent
          ? 'bg-yt-red/10 border border-yt-red/40'
          : 'bg-yt-paper/40 hover:bg-yt-paper border border-white/5 hover:border-white/10'
      }`}
    >
      {/* Drag Handle */}
      <div
        className="text-yt-muted hover:text-white p-1 cursor-grab active:cursor-grabbing rounded opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Position Index */}
      <span className="text-xs font-mono text-yt-muted w-4 text-center flex-shrink-0">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div
        className="relative w-[120px] h-[68px] flex-shrink-0 rounded-lg overflow-hidden cursor-pointer group/thumb bg-black/40"
        onClick={() => onPlay(item.videoId)}
      >
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
          }}
        />
        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/40 group-hover/thumb:bg-black/20 flex items-center justify-center transition-colors">
          <Play className={`w-5 h-5 fill-white text-white ${isCurrent ? 'opacity-100' : 'opacity-80 group-hover/thumb:opacity-100'}`} />
        </div>

        {/* Duration Badge */}
        {showDuration && (
          <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-[10px] text-white font-medium rounded">
            {item.duration}
          </span>
        )}
      </div>

      {/* Metadata Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <h4
          onClick={() => onPlay(item.videoId)}
          className={`text-[13px] font-medium line-clamp-2 leading-tight cursor-pointer hover:text-yt-red transition-colors ${
            isCurrent ? 'text-yt-red' : 'text-yt-text'
          }`}
          title={item.title}
        >
          {item.title}
        </h4>
        <p className="text-[12px] text-yt-muted truncate">{item.channel}</p>
      </div>

      {/* Hover Actions Bar */}
      <div className="flex items-center gap-1 bg-yt-dark/95 backdrop-blur px-1.5 py-1 rounded-lg border border-white/10 shadow-lg">
        <button
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy video link'}
          className="p-1 hover:bg-white/10 text-yt-muted hover:text-white rounded transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in new tab"
          className="p-1 hover:bg-white/10 text-yt-muted hover:text-white rounded transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          title="Remove from queue"
          className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
