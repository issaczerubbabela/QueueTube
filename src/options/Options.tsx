import React, { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { whatsNewVersion } from '../domain/changelog';
import type { Settings } from '../domain/queue';
import { send } from '../shared/messages';
import { useExtensionState } from '../shared/state';
import { formatShortcut } from '../ui/shortcut';
import { exportQueue, importQueue, pluralVideos } from '../ui/transfer';
import { Guide } from './Guide';
import type { BooleanSetting, SettingAnchor } from './guideEntries';
import { WhatsNew } from './WhatsNew';

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
    detail: "YouTube's title lookup doesn't include length, so Cue reads part of each queued video's page (about 0.75 MB, without your cookies). Lengths also fill in as you watch.",
  },
];

const COMMAND_LABELS: Record<string, string> = {
  'gather-tabs': 'Gather open YouTube tabs',
  'next-video': 'Play next',
  'previous-video': 'Play previous',
  'toggle-queue': 'Collapse or expand the panel',
};

/** What the Guide calls each row it links to. */
const SETTING_TITLES: Record<SettingAnchor, string> = {
  ...(Object.fromEntries([...QUEUE_SETTINGS, ...PLAYBACK_SETTINGS].map((s) => [s.key, s.title])) as Record<SettingAnchor, string>),
  export: 'Export queue',
  import: 'Import from file',
  history: 'Clear history',
};

const SECTIONS = [
  { id: 'guide', label: 'Guide' },
  { id: 'queueing', label: 'Queueing' },
  { id: 'playback', label: 'Playback' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'queue', label: 'Your queue' },
  { id: 'whats-new', label: "What's new" },
];

function SettingRows({ rows, settings }: { rows: typeof QUEUE_SETTINGS; settings: Settings }) {
  return (
    <>
      {rows.map(({ key, title, detail }) => (
        <div key={key} id={`setting-${key}`} className="setting">
          <span className="setting-label" id={`label-${key}`}>
            {title}
          </span>
          <label className="setting-control">
            <input
              type="checkbox"
              className="checkbox"
              aria-labelledby={`label-${key}`}
              aria-describedby={`detail-${key}`}
              checked={settings[key]}
              onChange={(e) => send({ type: 'settings/update', patch: { [key]: e.target.checked } })}
            />
            <span id={`detail-${key}`}>{detail}</span>
          </label>
        </div>
      ))}
    </>
  );
}

/** Laid out like YouTube's own settings pages: a left nav, a headline, then titled sections of label/control rows. */
export function Options() {
  const { ready, queue, settings, lastSeenVersion } = useExtensionState();
  const [commands, setCommands] = useState<browser.Commands.Command[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(SECTIONS[0].id);
  const fileInput = useRef<HTMLInputElement>(null);
  const isFirefox = navigator.userAgent.includes('Firefox');
  const version = browser.runtime.getManifest().version;
  const unseen = whatsNewVersion(lastSeenVersion, version) !== null;

  // Shortcuts are changed in the browser's own settings, so read them again on coming back.
  useEffect(() => {
    const refresh = () => browser.commands?.getAll().then(setCommands).catch(() => {});
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Highlight the nav entry for the section nearest the top of the viewport.
  useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      let current = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 160) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) current = SECTIONS[SECTIONS.length - 1].id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ready]);

  // The page renders after state loads, too late for the browser's own jump to a #section.
  useEffect(() => {
    if (ready) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [ready]);

  // Reading the changelog clears the What's new notice in the popup and panel.
  useEffect(() => {
    const section = ready && unseen ? document.getElementById('whats-new') : null;
    if (!section) return;
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) send({ type: 'whatsNew/seen' });
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [ready, unseen]);

  if (!ready) return null;

  const openShortcutSettings = () =>
    isFirefox
      ? browser.tabs.create({ url: 'about:addons' })
      : browser.tabs.create({ url: 'chrome://extensions/shortcuts' });

  return (
    <>
      <header className="masthead">
        <img src="/icons/icon48.png" alt="" className="logo" />
        <span className="wordmark">Cue</span>
        <span className="version">{version}</span>
      </header>

      <div className="layout">
        <nav className="nav" aria-label="Settings sections">
          <h2>Settings</h2>
          {SECTIONS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className="nav-item" aria-current={active === id ? 'true' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        <main className="page">
          <p className="eyebrow">Cue</p>
          <h1>Make Cue work your way</h1>

          <section id="guide">
            <h2>Guide</h2>
            <p className="section-sub">
              What Cue can do and how to use it. For recent changes, see <a href="#whats-new">What's new</a>.
            </p>
            <Guide commands={commands} settingTitles={SETTING_TITLES} />
          </section>

          <section id="queueing">
            <h2>Queueing</h2>
            <p className="section-sub">How videos get into the queue</p>
            <SettingRows rows={QUEUE_SETTINGS} settings={settings} />
          </section>

          <section id="playback">
            <h2>Playback</h2>
            <p className="section-sub">What happens in the player tab</p>
            <SettingRows rows={PLAYBACK_SETTINGS} settings={settings} />
          </section>

          <section id="shortcuts">
            <h2>Keyboard shortcuts</h2>
            <p className="section-sub">Shortcuts are managed by your browser</p>
            {commands
              .filter((c) => c.name && COMMAND_LABELS[c.name])
              .map((c) => (
                <div key={c.name} className="setting">
                  <span className="setting-label">{COMMAND_LABELS[c.name!]}</span>
                  <span className="setting-control">{c.shortcut ? <kbd>{formatShortcut(c.shortcut)}</kbd> : <span className="muted">Not set</span>}</span>
                </div>
              ))}
            <div className="setting">
              <span className="setting-label" />
              <span className="setting-control">
                <button className="link" onClick={openShortcutSettings}>
                  Change shortcuts
                </button>
              </span>
            </div>
          </section>

          <section id="queue">
            <h2>Your queue</h2>
            <p className="section-sub">Move your queue in and out of Cue as a text file of links</p>
            <div id="setting-export" className="setting">
              <span className="setting-label">Export</span>
              <span className="setting-control stacked">
                <button className="link" disabled={queue.entries.length === 0} onClick={() => exportQueue(queue.entries)}>
                  Export queue
                </button>
                <span className="muted">Saves {pluralVideos(queue.entries.length)} as a text file.</span>
              </span>
            </div>
            <div id="setting-import" className="setting">
              <span className="setting-label">Import</span>
              <span className="setting-control stacked">
                <button className="link" onClick={() => fileInput.current?.click()}>
                  Import from file
                </button>
                <span className="muted">Adds every YouTube link found in a text file.</span>
              </span>
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
            <div id="setting-history" className="setting">
              <span className="setting-label">History</span>
              <span className="setting-control stacked">
                <button className="link" disabled={queue.history.length === 0} onClick={() => send({ type: 'history/clear' })}>
                  Clear history
                </button>
                <span className="muted">{pluralVideos(queue.history.length)} you've moved past.</span>
              </span>
            </div>
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
          </section>

          <section id="whats-new">
            <h2>What's new</h2>
            <p className="section-sub">What changed in each version of Cue</p>
            <WhatsNew />
          </section>
        </main>
      </div>
    </>
  );
}
