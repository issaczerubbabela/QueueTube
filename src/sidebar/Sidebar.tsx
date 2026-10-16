import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Layers,
  ListPlus,
  ListVideo,
  Settings as SettingsIcon,
  SkipBack,
  Sparkles,
  SkipForward,
  Trash2,
  Upload,
  Download,
} from 'lucide-react';
import browser from 'webextension-polyfill';
import { whatsNewVersion } from '../domain/changelog';
import * as Q from '../domain/queue';
import { playlistUrl } from '../domain/youtube';
import { send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { Menu, Title, Toast, useMenu, useToast } from '../ui/components';
import { tintStyle, useTint } from '../ui/tint';
import { exportQueue, formatRemaining, importQueue, pluralVideos } from '../ui/transfer';
import { HistoryList } from './HistoryList';
import { QueueList } from './QueueList';

type Tab = 'queue' | 'history';

export function Sidebar() {
  const { ready, queue, settings, lastSeenVersion } = useExtensionState();
  const [tab, setTab] = useState<Tab>('queue');
  const menu = useMenu();
  const { toast, show, dismiss } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const tint = useTint(ready ? Q.currentEntry(queue)?.videoId : null);

  if (!ready) return null;

  const index = Q.currentIndex(queue);
  const next = Q.nextEntry(queue);
  const total = queue.entries.length;
  const remaining = formatRemaining(Q.remainingSeconds(queue));
  const position = total === 0 ? 'Nothing queued' : index >= 0 ? `${index + 1} / ${total}` : pluralVideos(total);
  const whatsNew = whatsNewVersion(lastSeenVersion, browser.runtime.getManifest().version);

  const setCollapsed = (sidebarCollapsed: boolean) => send({ type: 'settings/update', patch: { sidebarCollapsed } });

  const withUndo = (message: string) =>
    show({ message, action: { label: 'Undo', run: () => send({ type: 'queue/undo' }) } });

  const gather = async () => {
    const { gathered } = await send({ type: 'tabs/gather' });
    show({ message: gathered ? `Gathered ${gathered} ${gathered === 1 ? 'tab' : 'tabs'}` : 'No other YouTube video tabs open' });
  };

  const collapsed = settings.sidebarCollapsed;
  const subtitle = collapsed
    ? next
      ? null
      : position
    : [position, remaining].filter(Boolean).join(' · ');

  return (
    <section className={`panel${collapsed ? ' collapsed' : ''}`} aria-label="Cue queue panel" style={tintStyle(tint)}>
      <header className="panel-header">
        <div className="header-top">
          <div className="heading">
            <h2>Global Queue</h2>
            {subtitle !== null ? (
              <p className="subtitle">{subtitle}</p>
            ) : (
              <p className="subtitle">
                Next: <Title video={next!} className="next-title" />
              </p>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand queue' : 'Collapse queue'}
            aria-expanded={!collapsed}
            title={`${collapsed ? 'Expand' : 'Collapse'} (Alt+Shift+L)`}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
        {!collapsed && (
          <div className="header-actions">
            <div className="chips" role="tablist" aria-label="Queue view">
              <button className="chip" role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
                Queue
              </button>
              <button className="chip" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
                History
              </button>
            </div>
            <span className="spacer" />
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
              className={`icon-btn${whatsNew ? ' has-dot' : ''}`}
              onClick={menu.toggle}
              aria-label={whatsNew ? `Queue options (what's new in ${whatsNew})` : 'Queue options'}
              aria-haspopup="menu"
              aria-expanded={menu.anchor !== null}
            >
              <EllipsisVertical />
            </button>
          </div>
        )}
      </header>

      {!collapsed && (
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
      )}

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
            ...(whatsNew
              ? [
                  {
                    label: `What's new in ${whatsNew}`,
                    icon: <Sparkles />,
                    accent: true,
                    onSelect: () => send({ type: 'options/open', section: 'whats-new' }),
                  },
                  'separator' as const,
                ]
              : []),
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
