// CHANGELOG.md → plain data for the settings page's What's new section. Only the markdown the
// changelog uses: headings, nested bullet lists, paragraphs, `inline code` and **bold**.

export interface Inline {
  text: string;
  code?: true;
  strong?: true;
}

export interface ListItem {
  content: Inline[];
  children: ListItem[];
}

export type Block =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'list'; items: ListItem[] }
  | { type: 'paragraph'; content: Inline[] };

export interface VersionNotes {
  version: string;
  blocks: Block[];
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    out.push(match[1] !== undefined ? { text: match[1], code: true } : { text: match[2], strong: true });
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  // Open lists, outermost first, with the indent their bullets start at.
  let lists: { indent: number; items: ListItem[] }[] = [];
  let lastItem: ListItem | null = null;
  let paragraph: Inline[] | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      paragraph = null;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      lists = [];
      paragraph = null;
      blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(heading[2]) });
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      paragraph = null;
      const indent = bullet[1].length;
      const item: ListItem = { content: parseInline(bullet[2]), children: [] };
      let top = lists[lists.length - 1];
      if (!top) {
        const list: Block = { type: 'list', items: [item] };
        blocks.push(list);
        lists = [{ indent, items: list.items }];
      } else if (indent > top.indent) {
        const parent = top.items[top.items.length - 1];
        parent.children.push(item);
        lists.push({ indent, items: parent.children });
      } else {
        while (lists.length > 1 && indent < top.indent) {
          lists.pop();
          top = lists[lists.length - 1];
        }
        top.items.push(item);
      }
      lastItem = item;
      continue;
    }

    if (lists.length > 0 && /^\s/.test(line) && lastItem) {
      lastItem.content.push(...parseInline(' ' + line.trim()));
      continue;
    }

    lists = [];
    if (paragraph) {
      paragraph.push(...parseInline(' ' + line.trim()));
    } else {
      paragraph = parseInline(line.trim());
      blocks.push({ type: 'paragraph', content: paragraph });
    }
  }
  return blocks;
}

/** One section per `## <version>` heading, in file order (newest first). Anything above the first is dropped. */
export function parseVersions(markdown: string): VersionNotes[] {
  const versions: VersionNotes[] = [];
  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'heading' && block.level === 2) {
      versions.push({ version: block.content.map((c) => c.text).join('').trim(), blocks: [] });
    } else if (versions.length > 0 && !(block.type === 'heading' && block.level === 1)) {
      versions[versions.length - 1].blocks.push(block);
    }
  }
  return versions;
}

/**
 * The version to announce with a What's new notice, or null. A fresh install records its own
 * version as seen straight away, so a missing value means an update from before 1.2.
 */
export function whatsNewVersion(lastSeen: string | null, running: string): string | null {
  return lastSeen === running ? null : running;
}
