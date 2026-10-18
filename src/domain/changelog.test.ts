import { describe, expect, it } from 'vitest';
import changelogFile from '../../CHANGELOG.md?raw';
import { parseMarkdown, parseVersions, whatsNewVersion } from './changelog';

describe('parseMarkdown', () => {
  it('reads headings of any level', () => {
    expect(parseMarkdown('# Changelog\n\n## 1.2.0\n### Fixed')).toEqual([
      { type: 'heading', level: 1, content: [{ text: 'Changelog' }] },
      { type: 'heading', level: 2, content: [{ text: '1.2.0' }] },
      { type: 'heading', level: 3, content: [{ text: 'Fixed' }] },
    ]);
  });

  it('groups consecutive bullets into one list', () => {
    expect(parseMarkdown('- one\n* two\n- three')).toEqual([
      {
        type: 'list',
        items: [
          { content: [{ text: 'one' }], children: [] },
          { content: [{ text: 'two' }], children: [] },
          { content: [{ text: 'three' }], children: [] },
        ],
      },
    ]);
  });

  it('nests indented bullets under the bullet above them', () => {
    const md = ['- top', '  - child', '    - grandchild', '  - second child', '- next top'].join('\n');
    expect(parseMarkdown(md)).toEqual([
      {
        type: 'list',
        items: [
          {
            content: [{ text: 'top' }],
            children: [
              { content: [{ text: 'child' }], children: [{ content: [{ text: 'grandchild' }], children: [] }] },
              { content: [{ text: 'second child' }], children: [] },
            ],
          },
          { content: [{ text: 'next top' }], children: [] },
        ],
      },
    ]);
  });

  it('joins an indented continuation line onto its bullet', () => {
    expect(parseMarkdown('- a long\n  bullet')).toEqual([
      { type: 'list', items: [{ content: [{ text: 'a long' }, { text: ' bullet' }], children: [] }] },
    ]);
  });

  it('marks inline code and bold text', () => {
    expect(parseMarkdown('- Press `Alt+Shift+Q` to **Gather**')).toEqual([
      {
        type: 'list',
        items: [
          {
            content: [{ text: 'Press ' }, { text: 'Alt+Shift+Q', code: true }, { text: ' to ' }, { text: 'Gather', strong: true }],
            children: [],
          },
        ],
      },
    ]);
  });

  it('keeps markdown inside inline code as written', () => {
    expect(parseMarkdown('`**not bold**`')).toEqual([{ type: 'paragraph', content: [{ text: '**not bold**', code: true }] }]);
  });

  it('reads plain lines as paragraphs, split by blank lines', () => {
    expect(parseMarkdown('First line\nsame paragraph\n\nSecond')).toEqual([
      { type: 'paragraph', content: [{ text: 'First line' }, { text: ' same paragraph' }] },
      { type: 'paragraph', content: [{ text: 'Second' }] },
    ]);
  });

  it('ends a list at a heading or an unindented line', () => {
    const blocks = parseMarkdown('- a\n## 1.0\n- b\nAfter');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'heading', 'list', 'paragraph']);
  });

  it('copes with Windows line endings', () => {
    expect(parseMarkdown('## 1.0\r\n- a\r\n')).toEqual([
      { type: 'heading', level: 2, content: [{ text: '1.0' }] },
      { type: 'list', items: [{ content: [{ text: 'a' }], children: [] }] },
    ]);
  });
});

describe('parseVersions', () => {
  it('splits the changelog into one section per version, newest first', () => {
    const md = ['# Changelog', 'Intro', '## 1.1.0', '- b', '## 1.0', '### Added', '- a'].join('\n');
    const versions = parseVersions(md);
    expect(versions.map((v) => v.version)).toEqual(['1.1.0', '1.0']);
    expect(versions[1].blocks.map((b) => b.type)).toEqual(['heading', 'list']);
  });
});

describe('whatsNewVersion', () => {
  it('announces the running version until it has been seen', () => {
    expect(whatsNewVersion(null, '1.2.0')).toBe('1.2.0');
    expect(whatsNewVersion('1.1.1', '1.2.0')).toBe('1.2.0');
    expect(whatsNewVersion('1.2.0', '1.2.0')).toBeNull();
  });
});

describe('CHANGELOG.md', () => {
  const versions = parseVersions(changelogFile);

  it('covers every release so far', () => {
    expect(versions.map((v) => v.version)).toEqual(expect.arrayContaining(['1.2.0', '1.1.1', '1.1.0', '1.0']));
  });

  it('opens 1.2.0 with the rename to Cue', () => {
    const notes = versions.find((v) => v.version === '1.2.0')!;
    const text = JSON.stringify(notes.blocks[0]);
    expect(text).toMatch(/QueueTube/);
    expect(text).toMatch(/Cue/);
  });
});
