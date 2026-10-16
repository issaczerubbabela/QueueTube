import React, { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import type { Settings } from '../domain/queue';
import { send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { exportQueue, importQueue, pluralVideos } from '../ui/transfer';

type BooleanSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const QUEUE_SETTINGS: { key: BooleanSetting; title: string; detail: string }[] = [
  {
    key: 'autoQueue',
    title: 'Auto-queue new tabs',
    detail: 'A YouTube video opened in a new tab is added to the queue and the tab closes. Tabs you are already browsing in are never touched.',
  },
  {
    key: 'focusPlayerAfterQueueing',
    title: 'Return to the player',
    detail: 'After queueing a video you opened in the foreground, switch back to the player tab. Background tabs never steal focus.',
  },
  {
    key: 'allowDuplicates',
    title: 'Allow duplicates',
    detail: 'Let the same video appear in the queue more than once.',
  },
];

const PLAYBACK_SETTINGS: { key: BooleanSetting; title: string; detail: string }[] = [
  {
    key: 'autoAdvance',
    title: 'Play the next video automatically',
    detail: 'When a queued video ends, the next one starts in the player tab.',
  },
  {
    key: 'removeAfterPlaying',
    title: 'Remove videos after playing',
    detail: 'Videos leave the queue once you move past them. They stay in History.',
  },
  {
    key: 'lookUpDurations',
    title: 'Show video lengths',
    detail: "YouTube's title lookup doesn't include length, so QueueTube reads part of each queued video's page (about 0.75 MB, without your cookies). Lengths also fill in as you watch.",
  },
];

const COMMAND_LABELS: Record<string, string> = {
  'gather-tabs': 'Gather open YouTube tabs',
  'next-video': 'Play next',
  'previous-video': 'Play previous',
  'toggle-queue': 'Collapse or expand the panel',
};

function SettingRows({ rows, settings }: { rows: typeof QUEUE_SETTINGS; settings: Settings }) {
  return (
    <>
      {rows.map(({ key, title, detail }) => (
        <label key={key} className="cell">
          <span className="cell-text">
            <span className="cell-title">{title}</span>
            <span className="cell-detail">{detail}</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={settings[key]}
            onChange={(e) => send({ type: 'settings/update', patch: { [key]: e.target.checked } })}
          />
        </label>
      ))}
    </>
  );
}

export function Options() {
  const { ready, queue, settings } = useExtensionState();
  const [commands, setCommands] = useState<browser.Commands.Command[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isFirefox = navigator.userAgent.includes('Firefox');

  useEffect(() => {
    browser.commands?.getAll().then(setCommands).catch(() => {});
  }, []);

  if (!ready) return null;

  const openShortcutSettings = () =>
    isFirefox
      ? browser.tabs.create({ url: 'about:addons' })
      : browser.tabs.create({ url: 'chrome://extensions/shortcuts' });

  return (
    <main className="page">
      <header className="masthead">
        <img src="/icons/icon128.png" alt="" className="logo" />
        <div>
          <h1>QueueTube</h1>
          <p>One player tab. Every other video lines up behind it.</p>
        </div>
        <span className="version">v{browser.runtime.getManifest().version}</span>
      </header>

      <h2 className="group-label">Queueing</h2>
      <section className="group glass">
        <SettingRows rows={QUEUE_SETTINGS} settings={settings} />
      </section>

      <h2 className="group-label">Playback</h2>
      <section className="group glass">
        <SettingRows rows={PLAYBACK_SETTINGS} settings={settings} />
      </section>

      <h2 className="group-label">Keyboard shortcuts</h2>
      <section className="group glass">
        {commands
          .filter((c) => c.name && COMMAND_LABELS[c.name])
          .map((c) => (
            <div key={c.name} className="cell">
              <span className="cell-title">{COMMAND_LABELS[c.name!]}</span>
              {c.shortcut ? <kbd>{c.shortcut}</kbd> : <span className="unset">Not set</span>}
            </div>
          ))}
        <div className="cell">
          <span className="cell-detail">Shortcuts are managed by your browser.</span>
          <button className="btn" onClick={openShortcutSettings}>
            Change shortcuts
          </button>
        </div>
      </section>

      <h2 className="group-label">Your queue</h2>
      <section className="group glass">
        <div className="cell">
          <span className="cell-text">
            <span className="cell-title">Export</span>
            <span className="cell-detail">Save the queue ({pluralVideos(queue.entries.length)}) as a text file of links.</span>
          </span>
          <button className="btn" disabled={queue.entries.length === 0} onClick={() => exportQueue(queue.entries)}>
            Export
          </button>
        </div>
        <div className="cell">
          <span className="cell-text">
            <span className="cell-title">Import</span>
            <span className="cell-detail">Add every YouTube link found in a text file.</span>
          </span>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) setNotice(await importQueue(file).catch(() => 'Could not read that file'));
            }}
          />
        </div>
        <div className="cell">
          <span className="cell-text">
            <span className="cell-title">History</span>
            <span className="cell-detail">{pluralVideos(queue.history.length)} you've moved past.</span>
          </span>
          <button className="btn danger" disabled={queue.history.length === 0} onClick={() => send({ type: 'history/clear' })}>
            Clear history
          </button>
        </div>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
