import React, { useEffect } from 'react';
import { useQueueStore } from '../shared/store';
import {
  ListVideo,
  Layers,
  Sparkles,
  Shield,
  Layout,
  Moon,
  Keyboard,
  Check
} from 'lucide-react';

export const Options: React.FC = () => {
  const store = useQueueStore();

  useEffect(() => {
    store.init();
  }, []);

  const toggleSetting = (key: keyof typeof store.settings) => {
    const val = store.settings[key];
    if (typeof val === 'boolean') {
      store.setSettings({ [key]: !val });
    }
  };

  return (
    <div className="min-h-screen bg-yt-dark text-yt-text font-sans antialiased">
      {/* Top Banner */}
      <header className="border-b border-yt-border/50 bg-yt-paper/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yt-red/10 border border-yt-red/30 shadow-glow">
              <ListVideo className="w-6 h-6 text-yt-red" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">QueueTube Settings</h1>
              <p className="text-xs text-yt-muted">Customize your YouTube single-player queue experience</p>
            </div>
          </div>

          <div className="text-xs text-yt-muted font-mono bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            v1.0.0
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Section 1: Queue Behavior */}
        <section className="bg-yt-paper/40 border border-yt-border/50 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold border-b border-yt-border/40 pb-3">
            <Layers className="w-5 h-5 text-yt-red" />
            <h2>Queue & Interception Behavior</h2>
          </div>

          <div className="space-y-4">
            {/* Auto Gather */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-yt-paper/30 hover:bg-yt-paper/60 transition-colors">
              <div>
                <h3 className="text-sm font-medium text-white">Auto Gather New Tabs</h3>
                <p className="text-xs text-yt-muted mt-0.5">
                  Automatically intercept newly opened YouTube watch tabs and add them to queue.
                </p>
              </div>
              <button
                onClick={() => toggleSetting('autoGather')}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                  store.settings.autoGather ? 'bg-yt-red' : 'bg-yt-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    store.settings.autoGather ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Allow Duplicates */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-yt-paper/30 hover:bg-yt-paper/60 transition-colors">
              <div>
                <h3 className="text-sm font-medium text-white">Allow Duplicate Videos</h3>
                <p className="text-xs text-yt-muted mt-0.5">
                  Allow the same video to be queued multiple times.
                </p>
              </div>
              <button
                onClick={() => toggleSetting('allowDuplicates')}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                  store.settings.allowDuplicates ? 'bg-yt-red' : 'bg-yt-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    store.settings.allowDuplicates ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto Remove Played */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-yt-paper/30 hover:bg-yt-paper/60 transition-colors">
              <div>
                <h3 className="text-sm font-medium text-white">Auto Remove Played Videos</h3>
                <p className="text-xs text-yt-muted mt-0.5">
                  Automatically remove videos from queue after they finish playing and move to History.
                </p>
              </div>
              <button
                onClick={() => toggleSetting('autoRemovePlayed')}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                  store.settings.autoRemovePlayed ? 'bg-yt-red' : 'bg-yt-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    store.settings.autoRemovePlayed ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto Focus Player */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-yt-paper/30 hover:bg-yt-paper/60 transition-colors">
              <div>
                <h3 className="text-sm font-medium text-white">Auto Focus Player Tab</h3>
                <p className="text-xs text-yt-muted mt-0.5">
                  Switch focus back to the Master Player tab whenever a new video is queued.
                </p>
              </div>
              <button
                onClick={() => toggleSetting('autoFocusPlayer')}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                  store.settings.autoFocusPlayer ? 'bg-yt-red' : 'bg-yt-border'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    store.settings.autoFocusPlayer ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Appearance & Layout */}
        <section className="bg-yt-paper/40 border border-yt-border/50 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold border-b border-yt-border/40 pb-3">
            <Layout className="w-5 h-5 text-yt-red" />
            <h2>Appearance & Sidebar Layout</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">Queue Location</label>
              <p className="text-xs text-yt-muted mb-2.5">Controls where the QueueTube sidebar is anchored on YouTube.</p>
              <div className="grid grid-cols-3 gap-3">
                {(['right', 'bottom', 'floating'] as const).map((loc) => {
                  const labels: Record<string, string> = {
                    right: 'Right Sidebar',
                    bottom: 'Bottom Bar',
                    floating: 'Floating',
                  };
                  const notes: Record<string, string> = {
                    right: 'Embedded in YouTube secondary column',
                    bottom: 'Coming soon',
                    floating: 'Coming soon',
                  };
                  const disabled = loc !== 'right';
                  return (
                    <button
                      key={loc}
                      onClick={() => !disabled && store.setSettings({ queueLocation: loc })}
                      disabled={disabled}
                      className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                        store.settings.queueLocation === loc
                          ? 'border-yt-red bg-yt-red/10 text-white shadow-glow'
                          : disabled
                          ? 'border-white/5 bg-yt-paper/20 text-yt-muted/40 cursor-not-allowed'
                          : 'border-white/10 bg-yt-paper/30 text-yt-muted hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {store.settings.queueLocation === loc && <Check className="w-3.5 h-3.5 text-yt-red" />}
                        {labels[loc]}
                      </span>
                      {disabled && <span className="text-[10px] font-normal opacity-60">{notes[loc]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Keyboard Shortcuts */}
        <section className="bg-yt-paper/40 border border-yt-border/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold border-b border-yt-border/40 pb-3">
            <Keyboard className="w-5 h-5 text-yt-red" />
            <h2>Keyboard Shortcuts</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/30">
              <span className="text-yt-muted">Gather Open Tabs</span>
              <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono font-bold">Alt+Shift+Q</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/30">
              <span className="text-yt-muted">Play Next Video</span>
              <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono font-bold">Alt+Shift+N</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/30">
              <span className="text-yt-muted">Play Previous Video</span>
              <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono font-bold">Alt+Shift+P</kbd>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-yt-paper/30">
              <span className="text-yt-muted">Toggle Queue Sidebar</span>
              <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono font-bold">Alt+Shift+L</kbd>
            </div>
          </div>
          <p className="text-[11px] text-yt-muted/60 mt-2">
            To change shortcuts, go to <span className="text-white/60 font-mono">chrome://extensions/shortcuts</span> (Chrome) or <span className="text-white/60 font-mono">about:addons</span> (Firefox).
          </p>
        </section>
      </main>
    </div>
  );
};
