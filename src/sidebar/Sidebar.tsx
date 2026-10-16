import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Layers,
  ListPlus,
  ListVideo,
  Settings as SettingsIcon,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Download,
} from 'lucide-react';
import * as Q from '../domain/queue';
import { playlistUrl, thumbnailUrl } from '../domain/youtube';
import { send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { Equalizer, Menu, Title, Toast, useMenu, useToast } from '../ui/components';
import { exportQueue, formatRemaining, importQueue, pluralVideos } from '../ui/transfer';
import { HistoryList } from './HistoryList';
import { QueueList } from './QueueList';

type Tab = 'queue' | 'history';

export function Sidebar() {
  const { ready, queue, settings } = useExtensionState();
  const [tab, setTab] = useState<Tab>('queue');
  const menu = useMenu();
  const { toast, show, dismiss } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  if (!ready) return null;

  const index = Q.currentIndex(queue);
  const current = Q.currentEntry(queue);
  const next = Q.nextEntry(queue);
  const playing = Q.isCurrentPlaying(queue);
  const total = queue.entries.length;
  const remaining = formatRemaining(Q.remainingSeconds(queue));
  const position = index >= 0 ? `${index + 1} of ${total}` : pluralVideos(total);
  const art = queue.nowPlaying ?? current?.videoId ?? next?.videoId;
  const ambient = art ? <div className="ambient" style={{ backgroundImage: `url(${thumbnailUrl(art)})` }} /> : null;

  const setCollapsed = (sidebarCollapsed: boolean) => send({ type: 'settings/update', patch: { sidebarCollapsed } });

  const withUndo = (message: string) =>
    show({ message, action: { label: 'Undo', run: () => send({ type: 'queue/undo' }) } });

  const gather = async () => {
    const { gathered } = await send({ type: 'tabs/gather' });
    show({ message: gathered ? `Gathered ${gathered} ${gathered === 1 ? 'tab' : 'tabs'}` : 'No other YouTube video tabs open' });
  };

  if (settings.sidebarCollapsed) {
    return (
      <section className="panel glass collapsed" aria-label="QueueTube queue">
        {ambient}
        <button className="collapsed-main" onClick={() => setCollapsed(false)} aria-label="Expand queue">
          <span className="collapsed-icon">{playing ? <Equalizer /> : <ListVideo aria-hidden="true" />}</span>
          <span className="collapsed-text">
            {next ? (
              <>
                <span className="eyebrow">Up next</span>
                <Title video={next} className="collapsed-title" />
              </>
            ) : (
              <span className="collapsed-title">{total ? 'End of queue' : 'Queue is empty'}</span>
            )}
          </span>
          {total > 0 && <span className="pill-count">{position}</span>}
        </button>
        <button
          className="icon-btn"
          disabled={!next}
          onClick={() => send({ type: 'play/next' })}
          aria-label="Play next"
          title="Play next (Alt+Shift+.)"
        >
          <SkipForward />
        </button>
        <button className="icon-btn" onClick={() => setCollapsed(false)} aria-label="Expand queue" title="Expand (Alt+Shift+L)">
          <ChevronDown />
        </button>
      </section>
    );
  }

  return (
    <section className="panel glass" aria-label="QueueTube queue">
      <header className="panel-header">
        {ambient}
        <div className="header-row">
          <div className="heading">
            <h2>Up next</h2>
            <p className="subtitle">
              {total === 0 ? 'Nothing queued' : position}
              {remaining && <span> · {remaining}</span>}
            </p>
          </div>
          <div className="header-actions">
            <button
              className="icon-btn"
              disabled={!Q.canGoBack(queue, settings)}
              onClick={() => send({ type: 'play/previous' })}
              aria-label="Play previous"
              title="Previous (Alt+Shift+,)"
            >
              <SkipBack />
            </button>
            <button
              className="icon-btn"
              disabled={!next}
              onClick={() => send({ type: 'play/next' })}
              aria-label="Play next"
              title="Next (Alt+Shift+.)"
            >
              <SkipForward />
            </button>
            <button
              className="icon-btn"
              onClick={menu.toggle}
              aria-label="Queue options"
              aria-haspopup="menu"
              aria-expanded={menu.anchor !== null}
            >
              <Ellipsis />
            </button>
            <button className="icon-btn" onClick={() => setCollapsed(true)} aria-label="Collapse queue" title="Collapse (Alt+Shift+L)">
              <ChevronUp />
            </button>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Queue view">
          <button role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
            Queue<span className="count">{total}</span>
          </button>
          <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
            History<span className="count">{queue.history.length}</span>
          </button>
        </div>
      </header>

      <div className="panel-body" role="tabpanel">
        {tab === 'queue' ? (
          total === 0 ? (
            <div className="empty">
              <ListVideo className="empty-icon" aria-hidden="true" />
              <p className="empty-title">Nothing queued yet</p>
              <p className="empty-text">Open videos in new tabs and they'll line up here, or pull in the YouTube tabs you already have open.</p>
              <button className="btn" onClick={gather}>
                <Layers aria-hidden="true" /> Gather open tabs
              </button>
            </div>
          ) : (
            <QueueList
              queue={queue}
              onRemoved={(entry) => withUndo(`Removed “${entry.title || 'video'}”`)}
            />
          )
        ) : (
          <HistoryList queue={queue} />
        )}
      </div>

      <Toast toast={toast} onDismiss={dismiss} />

      <input
        ref={fileInput}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) show({ message: await importQueue(file).catch(() => 'Could not read that file') });
        }}
      />

      {menu.anchor && (
        <Menu
          anchor={menu.anchor}
          label="Queue options"
          onClose={menu.close}
          items={[
            { label: 'Gather open tabs', icon: <Layers />, onSelect: gather },
            { label: 'Import from file…', icon: <Upload />, onSelect: () => fileInput.current?.click() },
            { label: 'Export to file', icon: <Download />, disabled: total === 0, onSelect: () => exportQueue(queue.entries) },
            {
              label: 'Open as YouTube playlist',
              icon: <ListPlus />,
              disabled: total === 0,
              onSelect: () => send({ type: 'tabs/openFree', url: playlistUrl(queue.entries.map((e) => e.videoId)) }),
            },
            'separator',
            {
              label: 'Clear queue',
              icon: <Trash2 />,
              danger: true,
              disabled: total === 0,
              onSelect: async () => {
                await send({ type: 'queue/clear' });
                withUndo(`Cleared ${pluralVideos(total)}`);
              },
            },
            'separator',
            { label: 'Settings', icon: <SettingsIcon />, onSelect: () => send({ type: 'options/open' }) },
          ]}
        />
      )}
    </section>
  );
}
