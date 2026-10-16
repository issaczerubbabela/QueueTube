import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Video } from '../domain/queue';
import { formatDuration, thumbnailUrl } from '../domain/youtube';

/** Shown wherever the queue is empty: the two quickest ways to add a video. */
export const EMPTY_QUEUE_HINT = 'Middle-click or Alt+click any video to queue it.';

export function Thumb({ video, width }: { video: Video; width: number }) {
  const duration = formatDuration(video.durationSec);
  return (
    <div className="thumb" style={{ width }}>
      <img src={thumbnailUrl(video.videoId)} alt="" loading="lazy" decoding="async" draggable={false} />
      {duration && <span className="duration">{duration}</span>}
    </div>
  );
}

export function Title({ video, className }: { video: Video; className?: string }) {
  return video.title ? (
    <span className={className} title={video.title}>
      {video.title}
    </span>
  ) : (
    <span className={className}>
      <span className="skeleton" aria-hidden="true" />
      <span className="sr-only">Loading title</span>
    </span>
  );
}

export interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draws attention, like the What's new notice. */
  accent?: boolean;
}
export type MenuEntry = MenuItem | 'separator';

/**
 * A popover menu anchored to a button. It positions itself against the viewport so it is
 * never clipped by a scrolling list, and closes on outside click, Escape, or scroll.
 */
export function Menu({
  anchor,
  items,
  label,
  onClose,
}: {
  anchor: HTMLElement;
  items: MenuEntry[];
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 200;
    const above = rect.bottom + 6 + height > window.innerHeight - 8 && rect.top - 6 - height > 8;
    setPos({
      top: above ? rect.top - 6 - height : rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
      above,
    });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onPointer = (e: PointerEvent) => {
      const path = e.composedPath();
      if (ref.current && !path.includes(ref.current) && !path.includes(anchor)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const root = ref.current?.getRootNode() as Document | ShadowRoot;
    const index = buttons.indexOf(root.activeElement as HTMLButtonElement);
    const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  // Render at the root of the document or shadow tree so no ancestor's overflow, transform or
  // filter can clip or offset the fixed-position menu.
  const root = anchor.getRootNode();
  const layer = root instanceof ShadowRoot ? root : document.body;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="menu"
      data-placement={pos?.above ? 'above' : 'below'}
      style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}${item.accent ? ' accent' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>,
    layer
  );
}

/** Tracks which button (if any) has its menu open. */
export function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const target = e.currentTarget;
    setAnchor((current) => (current === target ? null : target));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { anchor, toggle, close };
}

export interface ToastData {
  message: string;
  action?: { label: string; run: () => void };
}

export function useToast(timeoutMs = 4500) {
  const [toast, setToast] = useState<ToastData | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [toast, timeoutMs]);
  return { toast, show: setToast, dismiss: () => setToast(null) };
}

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  return (
    <div role="status" aria-live="polite" className="toast-region">
      {toast && (
        <div className="toast">
          <span className="msg">{toast.message}</span>
          {toast.action && (
            <button
              className="btn"
              onClick={() => {
                toast.action!.run();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
