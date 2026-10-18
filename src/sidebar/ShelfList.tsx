import React, { useEffect, useRef, useState } from 'react';
import { Archive, ArrowDownToLine, ArrowUpToLine, EllipsisVertical, ExternalLink, Link, ListEnd, ListStart, X } from 'lucide-react';
import type { Shelf, ShelfItem } from '../domain/shelf';
import { watchUrl } from '../domain/youtube';
import { send } from '../shared/messages';
import { Menu, Thumb, Title, useMenu } from '../ui/components';
import { Drop, dropAt, targetIndex } from './QueueList';

/** Drag data naming a shelved video, so the Queue tab can take it back. */
export const SHELF_DRAG_TYPE = 'application/x-cue-shelf';

/**
 * The Shelf: videos set aside. Nothing here plays by itself; a video goes back to the queue (at
 * the end, or to play next) from its ⋮ menu, with Enter, or by dragging it onto the Queue tab.
 */
export function ShelfList({ shelf }: { shelf: Shelf }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [pending, setPending] = useState<Shelf | null>(null);
  const [menuItem, setMenuItem] = useState<ShelfItem | null>(null);
  const menu = useMenu();
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfterUpdate = useRef<string | null>(null);

  useEffect(() => setPending(null), [shelf]);
  const items = pending ?? shelf;

  useEffect(() => {
    const id = focusAfterUpdate.current;
    if (!id) return;
    focusAfterUpdate.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-video-id="${id}"]`)?.focus();
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="empty">
        <Archive className="empty-icon" aria-hidden="true" />
        <p className="empty-title">Nothing on the shelf</p>
        <p className="empty-text">Choose Move to shelf in a video's ⋮ menu, or drag it onto the Shelf tab, to set it aside without losing it.</p>
      </div>
    );
  }

  const moveTo = (item: ShelfItem, toIndex: number) => {
    const from = items.indexOf(item);
    const to = Math.max(0, Math.min(toIndex, items.length - 1));
    if (from < 0 || from === to) return;
    const reordered = [...items];
    reordered.splice(from, 1);
    reordered.splice(to, 0, item);
    setPending(reordered);
    send({ type: 'shelf/move', videoId: item.videoId, toIndex: to });
  };
  const back = (item: ShelfItem, at: 'end' | 'next') => send({ type: 'shelf/restore', videoId: item.videoId, at });
  const remove = (item: ShelfItem) => send({ type: 'shelf/remove', videoId: item.videoId });

  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, item: ShelfItem, index: number) => {
    if (e.target !== e.currentTarget) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-video-id]');
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (rows?.[index + 1] ?? rows?.[index - 1])?.focus();
      back(item, 'next');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      (rows?.[index + 1] ?? rows?.[index - 1])?.focus();
      remove(item);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault();
      focusAfterUpdate.current = item.videoId;
      moveTo(item, index + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      rows?.[index + (e.key === 'ArrowUp' ? -1 : 1)]?.focus();
    }
  };

  return (
    <>
      <p id="qt-shelf-hint" className="sr-only">
        Press Enter to play next, Alt plus arrow keys to reorder, Delete to remove.
      </p>
      <ol
        ref={listRef}
        className="list"
        aria-label="Shelf"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
        }}
      >
        {items.map((item, index) => {
          const dropClass =
            drop && dragging !== null && drop.index === index && targetIndex(dragging, drop) !== dragging
              ? drop.after
                ? ' drop-after'
                : ' drop-before'
              : '';
          return (
            <li
              key={item.videoId}
              data-video-id={item.videoId}
              tabIndex={0}
              aria-describedby="qt-shelf-hint"
              className={`row${dragging === index ? ' dragging' : ''}${dropClass}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', watchUrl(item.videoId));
                e.dataTransfer.setData(SHELF_DRAG_TYPE, item.videoId);
                setDragging(index);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const at = dropAt(e, index);
                if (drop?.index !== at.index || drop.after !== at.after) setDrop(at);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) moveTo(items[dragging], targetIndex(dragging, dropAt(e, index)));
                setDragging(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
              onKeyDown={(e) => onKeyDown(e, item, index)}
            >
              <span className="lead" aria-hidden="true">
                <span className="index">{index + 1}</span>
                <svg className="grip" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9h16M4 15h16" />
                </svg>
              </span>
              <Thumb video={item} width={100} progress />
              <span className="meta">
                <Title video={item} className="title" />
                <span className="channel">{item.channel || ' '}</span>
              </span>
              <span className="row-actions">
                <button
                  className="icon-btn"
                  aria-label={`More actions for ${item.title || 'video'}`}
                  aria-haspopup="menu"
                  aria-expanded={menuItem?.videoId === item.videoId && menu.anchor !== null}
                  onClick={(e) => {
                    setMenuItem(item);
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
      {menu.anchor && menuItem && (
        <Menu
          anchor={menu.anchor}
          label="Shelf actions"
          onClose={menu.close}
          items={[
            { label: 'Back to queue', icon: <ListEnd />, onSelect: () => back(menuItem, 'end') },
            { label: 'Play next', icon: <ListStart />, onSelect: () => back(menuItem, 'next') },
            { label: 'Move to top', icon: <ArrowUpToLine />, disabled: items.indexOf(menuItem) === 0, onSelect: () => moveTo(menuItem, 0) },
            {
              label: 'Move to bottom',
              icon: <ArrowDownToLine />,
              disabled: items.indexOf(menuItem) === items.length - 1,
              onSelect: () => moveTo(menuItem, items.length - 1),
            },
            'separator',
            { label: 'Open in new tab', icon: <ExternalLink />, onSelect: () => send({ type: 'tabs/openFree', url: watchUrl(menuItem.videoId) }) },
            { label: 'Copy link', icon: <Link />, onSelect: () => navigator.clipboard.writeText(watchUrl(menuItem.videoId)) },
            'separator',
            { label: 'Remove from shelf', icon: <X />, danger: true, onSelect: () => remove(menuItem) },
          ]}
        />
      )}
    </>
  );
}
