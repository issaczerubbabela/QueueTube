import React, { useEffect, useState } from 'react';
import {
  CircleHelp,
  Layers,
  ListVideo,
  MonitorPlay,
  PanelRightClose,
  PanelRightOpen,
  Settings as SettingsIcon,
  SkipBack,
  SkipForward,
  Sparkles,
  SquarePlay,
} from 'lucide-react';
import browser from 'webextension-polyfill';
import { whatsNewVersion } from '../domain/changelog';
import * as Q from '../domain/queue';
import { OptionsSection, Status, send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { Thumb, Title } from '../ui/components';
import { formatShortcut } from '../ui/shortcut';
import { formatRemaining, pluralVideos } from '../ui/transfer';

// Browsers cap extension popups at 600px tall; this keeps the popup inside that.
const UP_NEXT_LIMIT = 2;

/** Laid out like YouTube's own dropdown menus: a header, then 40px icon rows between dividers. */
export function Popup() {
  const { ready, queue, settings, lastSeenVersion } = useExtensionState();
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  const refreshStatus = () => send({ type: 'status' }).then(setStatus).catch(() => {});
  useEffect(() => {
    refreshStatus();
    browser.commands
      ?.getAll()
      .then((all) => setShortcuts(Object.fromEntries(all.map((c) => [c.name ?? '', c.shortcut ?? '']))))
      .catch(() => {});
  }, []);

  if (!ready || !status) return <div className="popup loading" />;

  const upcoming = Q.upcoming(queue);
  const hasPlayer = status.playerTabId !== null;
  const index = Q.currentIndex(queue);
  const total = queue.entries.length;
  const remaining = formatRemaining(Q.remainingSeconds(queue));
  const position = total === 0 ? 'Nothing queued' : index >= 0 ? `${index + 1} / ${total}` : pluralVideos(total);
  const whatsNew = whatsNewVersion(lastSeenVersion, browser.runtime.getManifest().version);
  // What the player shows, with whatever details we know about it.
  const nowVideo: Q.Video | null = queue.nowPlaying
    ? [...queue.entries, ...queue.history].find((v) => v.videoId === queue.nowPlaying) ??
      { videoId: queue.nowPlaying, title: 'A video outside your queue', channel: '', durationSec: null }
    : null;

  const gather = async () => {
    const { gathered } = await send({ type: 'tabs/gather' });
    setNotice(gathered ? `Gathered ${gathered} ${gathered === 1 ? 'tab' : 'tabs'}` : 'No other YouTube video tabs open');
    refreshStatus();
  };

  const openOptions = async (section: OptionsSection) => {
    await send({ type: 'options/open', section });
    window.close();
  };
  const shortcut = (name: string) => shortcuts[name] && <kbd>{formatShortcut(shortcuts[name])}</kbd>;

  const goToPlayer = async () => {
    await send({ type: 'player/focus' });
    window.close();
  };

  return (
    <div className="popup">
      <header className="top">
        <img src="/icons/icon48.png" alt="" className="logo" />
        <div className="top-text">
          <h1>Cue</h1>
          <p>{[position, remaining].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="top-actions">
          <button className="icon-btn" onClick={() => openOptions('guide')} aria-label="Guide" title="Guide">
            <CircleHelp />
          </button>
          <button className="icon-btn" onClick={() => browser.runtime.openOptionsPage()} aria-label="Settings" title="Settings">
            <SettingsIcon />
          </button>
        </span>
      </header>

      {whatsNew && (
        <button className="item whats-new" onClick={() => openOptions('whats-new')}>
          <Sparkles aria-hidden="true" />
          What's new in {whatsNew}
        </button>
      )}

      <hr />

      <section className="now" aria-label="Player">
        {hasPlayer && nowVideo ? (
          <button className="video" onClick={goToPlayer} title="Go to the player tab">
            <Thumb video={nowVideo} width={100} />
            <span className="video-meta">
              <span className="label">{Q.isCurrentPlaying(queue) ? 'Now playing' : 'Playing outside your queue'}</span>
              <Title video={nowVideo} className="video-title" />
              {nowVideo.channel && <span className="video-channel">{nowVideo.channel}</span>}
            </span>
          </button>
        ) : (
          <p className="placeholder">
            {hasPlayer ? 'The player is ready. Pick something from the queue to start.' : 'No player tab yet. The YouTube tab you open becomes the player.'}
          </p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="upnext" aria-label="Up next">
          <h2>
            Up next <span className="count">{upcoming.length}</span>
          </h2>
          <ol>
            {upcoming.slice(0, UP_NEXT_LIMIT).map((entry) => (
              <li key={entry.id}>
                <button className="video small" onClick={() => send({ type: 'play/entry', entryId: entry.id })} title="Play now">
                  <Thumb video={entry} width={88} />
                  <span className="video-meta">
                    <Title video={entry} className="video-title" />
                    <span className="video-channel">{entry.channel || ' '}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <hr />

      <nav className="items" aria-label="Actions">
        {!hasPlayer && (
          <button className="item" onClick={goToPlayer}>
            <SquarePlay aria-hidden="true" />
            Open YouTube
          </button>
        )}
        {status.claimableTabId !== null && (
          <button className="item" onClick={() => send({ type: 'player/claimActiveTab' }).then(refreshStatus)}>
            <MonitorPlay aria-hidden="true" />
            Play queue in this tab
          </button>
        )}
        <button className="item" disabled={!Q.canGoBack(queue, settings)} onClick={() => send({ type: 'play/previous' })}>
          <SkipBack aria-hidden="true" />
          Play previous
          {shortcut('previous-video')}
        </button>
        <button className="item" disabled={!Q.nextEntry(queue)} onClick={() => send({ type: 'play/next' })}>
          <SkipForward aria-hidden="true" />
          Play next
          {shortcut('next-video')}
        </button>
      </nav>

      <hr />

      <nav className="items" aria-label="Queue">
        <button className="item" onClick={gather}>
          <Layers aria-hidden="true" />
          Gather open tabs
          {shortcut('gather-tabs')}
        </button>
        <button
          className="item"
          disabled={!hasPlayer}
          onClick={() => send({ type: 'settings/update', patch: { sidebarCollapsed: !settings.sidebarCollapsed } })}
        >
          {settings.sidebarCollapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}
          {settings.sidebarCollapsed ? 'Expand queue panel' : 'Collapse queue panel'}
          {shortcut('toggle-queue')}
        </button>
        <label className="item">
          <ListVideo aria-hidden="true" />
          <span className="item-text">Auto-queue new tabs</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.autoQueue}
            onChange={(e) => send({ type: 'settings/update', patch: { autoQueue: e.target.checked } })}
          />
        </label>
      </nav>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
