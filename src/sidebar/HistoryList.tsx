import React from 'react';
import { History, ListPlus, RotateCcw } from 'lucide-react';
import type { Queue } from '../domain/queue';
import { send } from '../shared/messages';
import { Thumb, Title } from '../ui/components';

function playedAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistoryList({ queue }: { queue: Queue }) {
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
            <Thumb video={item} width={92} />
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
                aria-label={`Queue ${item.title || 'video'} again`}
                title="Add to queue"
                onClick={(e) => {
                  e.stopPropagation();
                  send({ type: 'queue/add', videoIds: [item.videoId] });
                }}
              >
                <ListPlus />
              </button>
              <button
                className="icon-btn"
                aria-label={`Watch ${item.title || 'video'} again`}
                title="Watch again"
                onClick={(e) => {
                  e.stopPropagation();
                  send({ type: 'play/video', videoId: item.videoId });
                }}
              >
                <RotateCcw />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="list-footer">
        <button className="btn subtle" onClick={() => send({ type: 'history/clear' })}>
          Clear history
        </button>
      </div>
    </>
  );
}
