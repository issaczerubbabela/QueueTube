import React, { useEffect, useState } from 'react';
import { ExternalLink, Layers, MonitorPlay, PanelRightClose, PanelRightOpen, Settings as SettingsIcon, SkipBack, SkipForward } from 'lucide-react';
import browser from 'webextension-polyfill';
import * as Q from '../domain/queue';
import { thumbnailUrl } from '../domain/youtube';
import { Status, send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { Equalizer, Thumb, Title } from '../ui/components';
import { formatRemaining, pluralVideos } from '../ui/transfer';

const UP_NEXT_LIMIT = 4;

export function Popup() {
  const { ready, queue, settings } = useExtensionState();
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshStatus = () => send({ type: 'status' }).then(setStatus).catch(() => {});
  useEffect(() => {
    refreshStatus();
  }, []);

  if (!ready || !status) return <div className="popup loading" />;

  const current = Q.currentEntry(queue);
  const upcoming = Q.upcoming(queue);
  const playing = Q.isCurrentPlaying(queue);
  const hasPlayer = status.playerTabId !== null;
  // What the player shows, with whatever details we know about it.
  const nowVideo: Q.Video | null = queue.nowPlaying
    ? [...queue.entries, ...queue.history].find((v) => v.videoId === queue.nowPlaying) ??
      { videoId: queue.nowPlaying, title: 'A video outside your queue', channel: '', durationSec: null }
    : null;
  const art = queue.nowPlaying ?? current?.videoId ?? upcoming[0]?.videoId;
  const remaining = formatRemaining(Q.remainingSeconds(queue));

  const gather = async () => {
    const { gathered } = await send({ type: 'tabs/gather' });
    setNotice(gathered ? `Gathered ${gathered} ${gathered === 1 ? 'tab' : 'tabs'}` : 'No other YouTube video tabs open');
    refreshStatus();
  };

  const goToPlayer = async () => {
    await send({ type: 'player/focus' });
    window.close();
  };

  return (
    <div className="popup">
      <header className="top">
        <img src="/icons/icon48.png" alt="" className="logo" />
        <h1>QueueTube</h1>
        <button className="icon-btn" onClick={() => browser.runtime.openOptionsPage()} aria-label="Settings" title="Settings">
          <SettingsIcon />
        </button>
      </header>

      <section className="now glass" aria-label="Player">
        {art && <div className="ambient" style={{ backgroundImage: `url(${thumbnailUrl(art)})` }} />}
        <div className="now-body">
          {hasPlayer && nowVideo ? (
            <div className="now-track">
              <Thumb video={nowVideo} width={88} />
              <div className="now-meta">
                <span className="eyebrow">{playing ? <><Equalizer /> Now playing</> : 'Not from your queue'}</span>
                <Title video={nowVideo} className="now-title" />
                {nowVideo.channel && <span className="now-channel">{nowVideo.channel}</span>}
              </div>
            </div>
          ) : (
            <div className="now-empty">
              <MonitorPlay aria-hidden="true" />
              <div>
                <p className="now-title">{hasPlayer ? 'Player is ready' : 'No player tab'}</p>
                <p className="now-channel">
                  {hasPlayer ? 'Pick something from the queue to start.' : 'Open YouTube and that tab becomes your player.'}
                </p>
              </div>
            </div>
          )}

          <div className="transport">
            <button
              className="icon-btn"
              disabled={!Q.canGoBack(queue, settings)}
              onClick={() => send({ type: 'play/previous' })}
              aria-label="Play previous"
              title="Previous (Alt+Shift+,)"
            >
              <SkipBack />
            </button>
            <button className="btn primary" onClick={goToPlayer}>
              <ExternalLink aria-hidden="true" />
              {hasPlayer ? 'Go to player' : 'Open YouTube'}
            </button>
            <button
              className="icon-btn"
              disabled={!Q.nextEntry(queue)}
              onClick={() => send({ type: 'play/next' })}
              aria-label="Play next"
              title="Next (Alt+Shift+.)"
            >
              <SkipForward />
            </button>
          </div>
        </div>
      </section>

      {status.claimableTabId !== null && (
        <button className="claim" onClick={() => send({ type: 'player/claimActiveTab' }).then(refreshStatus)}>
          <MonitorPlay aria-hidden="true" />
          <span>
            <strong>Play queue in this tab</strong>
            <span>{hasPlayer ? 'Makes this tab the player instead' : 'Makes this tab the player'}</span>
          </span>
        </button>
      )}

      <section className="upnext" aria-label="Up next">
        <div className="section-head">
          <h2>Up next</h2>
          <span>
            {upcoming.length ? pluralVideos(upcoming.length) : 'Empty'}
            {remaining && ` · ${remaining}`}
          </span>
        </div>
        {upcoming.length === 0 ? (
          <p className="hint">Open YouTube videos in new tabs to queue them.</p>
        ) : (
          <ol>
            {upcoming.slice(0, UP_NEXT_LIMIT).map((entry) => (
              <li key={entry.id}>
                <button className="mini" onClick={() => send({ type: 'play/entry', entryId: entry.id })} title="Play now">
                  <Thumb video={entry} width={64} />
                  <span className="mini-meta">
                    <Title video={entry} className="mini-title" />
                    <span className="mini-channel">{entry.channel || ' '}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {upcoming.length > UP_NEXT_LIMIT && <p className="more">+ {upcoming.length - UP_NEXT_LIMIT} more in the panel</p>}
      </section>

      <div className="actions">
        <button className="btn" onClick={gather} title="Gather open YouTube tabs (Alt+Shift+Q)">
          <Layers aria-hidden="true" /> Gather tabs
        </button>
        <button
          className="btn"
          disabled={!hasPlayer}
          onClick={() => send({ type: 'settings/update', patch: { sidebarCollapsed: !settings.sidebarCollapsed } })}
          title="Show or hide the queue panel (Alt+Shift+L)"
        >
          {settings.sidebarCollapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}
          {settings.sidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
        </button>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <label className="toggle-row">
        <span>
          <strong>Auto-queue new tabs</strong>
          <span>Videos opened in a new tab join the queue</span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={settings.autoQueue}
          onChange={(e) => send({ type: 'settings/update', patch: { autoQueue: e.target.checked } })}
        />
      </label>
    </div>
  );
}
