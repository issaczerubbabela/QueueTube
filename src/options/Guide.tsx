import React from 'react';
import type browser from 'webextension-polyfill';
import { formatShortcut } from '../ui/shortcut';
import { GUIDE, SettingAnchor } from './guideEntries';

interface Props {
  /** The browser's current shortcuts, from `commands.getAll()`. */
  commands: browser.Commands.Command[];
  settingTitles: Record<SettingAnchor, string>;
}

export function Guide({ commands, settingTitles }: Props) {
  const shortcutOf = (name: string) => commands.find((c) => c.name === name)?.shortcut || null;
  return (
    <>
      {GUIDE.map((group) => (
        <div key={group.title} className="guide-group">
          <h3>{group.title}</h3>
          {group.entries.map((entry) => {
            const shortcut = entry.shortcut ? shortcutOf(entry.shortcut) : null;
            return (
              <div key={entry.title} className="setting guide-entry">
                <span className="setting-label">{entry.title}</span>
                <span className="setting-control stacked">
                  <span>{entry.text}</span>
                  {(entry.shortcut || entry.setting) && (
                    <span className="guide-meta">
                      {entry.shortcut &&
                        (shortcut ? (
                          <kbd title="Keyboard shortcut">{formatShortcut(shortcut)}</kbd>
                        ) : (
                          <a href="#shortcuts" className="muted">
                            No shortcut set
                          </a>
                        ))}
                      {entry.setting && (
                        <span className="muted">
                          Setting:{' '}
                          <a href={`#setting-${entry.setting}`} className="link">
                            {settingTitles[entry.setting]}
                          </a>
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
