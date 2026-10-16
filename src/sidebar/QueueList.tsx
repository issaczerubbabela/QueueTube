import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, EllipsisVertical, ExternalLink, Link, ListStart, Play, X } from 'lucide-react';
import * as Q from '../domain/queue';
import { watchUrl } from '../domain/youtube';
import { send } from '../shared/messages';
import { Menu, Thumb, Title, useMenu } from '../ui/components';
import { dropVideos, mayHoldLinks } from '../ui/transfer';

interface Props {
  queue: Q.Queue;
  onRemoved: (entry: Q.Entry) => void;
  /** A message after links dropped from the page were not added (already queued). */
  onDropMessage: (message: string) => void;
}

type Drop = { index: number; after: boolean };

/** Where a drag over a row would drop: before it on its top half, after it on its bottom half. */
function dropAt(e: React.DragEvent<HTMLElement>, index: number): Drop {
  const rect = e.currentTarget.getBoundingClientRect();
  return { index, after: e.clientY > rect.top + rect.height / 2 };
}

/** Index the dragged entry ends up at when dropped before/after the row at `drop.index`. */
function targetIndex(from: number, drop: Drop): number {
  const insertAt = drop.index + (drop.after ? 1 : 0);
  return insertAt > from ? insertAt - 1 : insertAt;
}

export function QueueList({ queue, onRemoved, onDropMessage }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // Optimistic order while a move is in flight, so a dropped row doesn't snap back for a frame.
  const [pending, setPending] = useState<Q.Entry[] | null>(null);
  const [menuEntry, setMenuEntry] = useState<Q.Entry | null>(null);
  const menu = useMenu();
  const focusAfterUpdate = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => setPending(null), [queue.entries]);

  const entries = pending ?? queue.entries;
  const currentIdx = entries.findIndex((e) => e.id === queue.currentId);

  // Keep keyboard focus on a row after it moves.
  useEffect(() => {
    const id = focusAfterUpdate.current;
    if (!id) return;
    focusAfterUpdate.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)?.focus();
  }, [entries]);

  // Scroll the current entry into view when it changes.
  useEffect(() => {
    if (!queue.currentId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-entry-id="${queue.currentId}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [queue.currentId]);

  const moveTo = (entry: Q.Entry, toIndex: number) => {
    const from = entries.indexOf(entry);
    const to = Math.max(0, Math.min(toIndex, entries.length - 1));
    if (from < 0 || from === to) return;
    const reordered = [...entries];
    reordered.splice(from, 1);
    reordered.splice(to, 0, entry);
    setPending(reordered);
    send({ type: 'queue/move', entryId: entry.id, toIndex: to });
  };

  const remove = (entry: Q.Entry) => {
    send({ type: 'queue/remove', entryId: entry.id });
    onRemoved(entry);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, entry: Q.Entry, index: number) => {
    if (e.target !== e.currentTarget) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-entry-id]');
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      send({ type: 'play/entry', entryId: entry.id });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      (rows?.[index + 1] ?? rows?.[index - 1])?.focus();
      remove(entry);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault();
      focusAfterUpdate.current = entry.id;
      moveTo(entry, index + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      rows?.[index + (e.key === 'ArrowUp' ? -1 : 1)]?.focus();
    }
  };

  const menuItems = useMemo(() => {
    const entry = menuEntry;
    if (!entry) return [];
    const index = entries.indexOf(entry);
    const isCurrent = entry.id === queue.currentId;
    return [
      { label: 'Play now', icon: <Play />, onSelect: () => send({ type: 'play/entry', entryId: entry.id }) },
      {
        label: 'Play next',
        icon: <ListStart />,
        disabled: isCurrent || index === currentIdx + 1,
        onSelect: () => send({ type: 'queue/playNextInLine', entryId: entry.id }),
      },
      { label: 'Move to top', icon: <ArrowUpToLine />, disabled: index === 0, onSelect: () => moveTo(entry, 0) },
      {
        label: 'Move to bottom',
        icon: <ArrowDownToLine />,
        disabled: index === entries.length - 1,
        onSelect: () => moveTo(entry, entries.length - 1),
      },
      'separator' as const,
      {
        label: 'Open in new tab',
        icon: <ExternalLink />,
        onSelect: () => send({ type: 'tabs/openFree', url: watchUrl(entry.videoId) }),
      },
      { label: 'Copy link', icon: <Link />, onSelect: () => navigator.clipboard.writeText(watchUrl(entry.videoId)) },
      'separator' as const,
      { label: 'Remove from queue', icon: <X />, danger: true, onSelect: () => remove(entry) },
    ];
  }, [menuEntry, entries, queue.currentId, currentIdx]);

  return (
    <>
      <p id="qt-reorder-hint" className="sr-only">
        Press Enter to play, Alt plus arrow keys to reorder, Delete to remove.
      </p>
      <ol ref={listRef} className="list" aria-label="Queue" onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}>
        {entries.map((entry, index) => {
          const isCurrent = entry.id === queue.currentId;
          // Rows dragged within the panel move; links dragged in from the page are added there.
          const dropClass =
            drop && drop.index === index && (dragging === null || targetIndex(dragging, drop) !== dragging)
              ? drop.after
                ? ' drop-after'
                : ' drop-before'
              : '';
          return (
            <li
              key={entry.id}
              data-entry-id={entry.id}
              tabIndex={0}
              aria-current={isCurrent ? 'true' : undefined}
              aria-describedby="qt-reorder-hint"
              className={`row${isCurrent ? ' current' : ''}${dragging === index ? ' dragging' : ''}${dropClass}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', watchUrl(entry.videoId));
                setDragging(index);
              }}
              onDragOver={(e) => {
                if (dragging === null && !mayHoldLinks(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = dragging === null ? 'copy' : 'move';
                const at = dropAt(e, index);
                if (drop?.index !== at.index || drop.after !== at.after) setDrop(at);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const at = dropAt(e, index);
                if (dragging !== null) moveTo(entries[dragging], targetIndex(dragging, at));
                else dropVideos(e.dataTransfer, at.index + (at.after ? 1 : 0)).then((message) => message && onDropMessage(message));
                setDragging(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
              onClick={() => send({ type: 'play/entry', entryId: entry.id })}
              onKeyDown={(e) => onKeyDown(e, entry, index)}
            >
              <span className="lead" aria-hidden="true">
                {isCurrent ? <Play className="current-mark" /> : <span className="index">{index + 1}</span>}
                <svg className="grip" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9h16M4 15h16" />
                </svg>
              </span>
              <Thumb video={entry} width={100} progress />
              <span className="meta">
                <Title video={entry} className="title" />
                <span className="channel">{entry.channel || ' '}</span>
              </span>
              <span className="row-actions">
                <button
                  className="icon-btn"
                  aria-label={`More actions for ${entry.title || 'video'}`}
                  aria-haspopup="menu"
                  aria-expanded={menuEntry?.id === entry.id && menu.anchor !== null}
                  onClick={(e) => {
                    setMenuEntry(entry);
                    menu.toggle(e);
                  }}
                >
                  <EllipsisVertical />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {menu.anchor && menuEntry && (
        <Menu anchor={menu.anchor} label="Video actions" onClose={menu.close} items={menuItems} />
      )}
    </>
  );
}
