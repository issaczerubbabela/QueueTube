import React, { useState } from 'react';
import { EllipsisVertical, ExternalLink, History, Link, ListPlus, RotateCcw } from 'lucide-react';
import type { HistoryItem, Queue } from '../domain/queue';
import { watchUrl } from '../domain/youtube';
import { send } from '../shared/messages';
import { Menu, Thumb, Title, useMenu } from '../ui/components';

function playedAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistoryList({ queue }: { queue: Queue }) {
  const menu = useMenu();
  const [menuItem, setMenuItem] = useState<HistoryItem | null>(null);

  if (queue.history.length === 0) {
    return (
      <div className="empty">
        <History className="empty-icon" aria-hidden="true" />
        <p className="empty-title">No history yet</p>
        <p className="empty-text">Videos you move past in the queue show up here.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="list" aria-label="History">
        {queue.history.map((item) => (
          <li
            key={`${item.videoId}-${item.playedAt}`}
            className="row"
            tabIndex={0}
            onClick={() => send({ type: 'play/video', videoId: item.videoId })}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                send({ type: 'play/video', videoId: item.videoId });
              }
            }}
          >
            <span className="lead" aria-hidden="true" />
            <Thumb video={item} width={100} />
            <span className="meta">
              <Title video={item} className="title" />
              <span className="channel">
                {item.channel ? `${item.channel} · ` : ''}
                {playedAgo(item.playedAt)}
              </span>
            </span>
            <span className="row-actions">
              <button
                className="icon-btn"
                aria-label={`More actions for ${item.title || 'video'}`}
                aria-haspopup="menu"
                aria-expanded={menuItem === item && menu.anchor !== null}
                onClick={(e) => {
                  setMenuItem(item);
                  menu.toggle(e);
                }}
              >
                <EllipsisVertical />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="list-footer">
        <button className="btn text" onClick={() => send({ type: 'history/clear' })}>
          Clear history
        </button>
      </div>
      {menu.anchor && menuItem && (
        <Menu
          anchor={menu.anchor}
          label="Video actions"
          onClose={menu.close}
          items={[
            { label: 'Watch again', icon: <RotateCcw />, onSelect: () => send({ type: 'play/video', videoId: menuItem.videoId }) },
            { label: 'Add to queue', icon: <ListPlus />, onSelect: () => send({ type: 'queue/add', videoIds: [menuItem.videoId] }) },
            'separator',
            {
              label: 'Open in new tab',
              icon: <ExternalLink />,
              onSelect: () => send({ type: 'tabs/openFree', url: watchUrl(menuItem.videoId) }),
            },
            { label: 'Copy link', icon: <Link />, onSelect: () => navigator.clipboard.writeText(watchUrl(menuItem.videoId)) },
          ]}
        />
      )}
    </>
  );
}
