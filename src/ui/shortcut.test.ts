import { describe, expect, it } from 'vitest';
import { formatShortcut } from './shortcut';

describe('formatShortcut', () => {
  it.each([
    ['Alt+Shift+Q', 'Alt+Shift+Q'],
    ['Alt+Shift+Period', 'Alt+Shift+.'],
    ['Alt+Shift+Comma', 'Alt+Shift+,'],
    ['Ctrl+Up', 'Ctrl+↑'],
    ['⇧⌥Q', '⇧⌥Q'],
  ])('writes %s as %s', (reported, shown) => {
    expect(formatShortcut(reported)).toBe(shown);
  });
});
