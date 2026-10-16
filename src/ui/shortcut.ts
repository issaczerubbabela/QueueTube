/** A shortcut as the browser reports it ("Alt+Shift+Period"), written the way it reads on a keyboard ("Alt+Shift+."). */
export function formatShortcut(shortcut: string): string {
  const keys: Record<string, string> = { Period: '.', Comma: ',', Up: '↑', Down: '↓', Left: '←', Right: '→' };
  return shortcut
    .split('+')
    .map((key) => keys[key] ?? key)
    .join('+');
}
