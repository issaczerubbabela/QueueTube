import React from 'react';
import changelog from '../../CHANGELOG.md?raw';
import { Block, Inline, ListItem, parseVersions } from '../domain/changelog';

// Parsed once: CHANGELOG.md is bundled into the page at build time.
const VERSIONS = parseVersions(changelog);

function Text({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((span, i) =>
        span.code ? <code key={i}>{span.text}</code> : span.strong ? <strong key={i}>{span.text}</strong> : <React.Fragment key={i}>{span.text}</React.Fragment>
      )}
    </>
  );
}

function Items({ items }: { items: ListItem[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          <Text content={item.content} />
          {item.children.length > 0 && <Items items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'list') return <Items key={i} items={block.items} />;
        if (block.type === 'paragraph')
          return (
            <p key={i}>
              <Text content={block.content} />
            </p>
          );
        // Version headings are h3 under the section's h2; anything deeper follows on.
        const Tag = `h${Math.min(block.level + 1, 6)}` as 'h4';
        return (
          <Tag key={i}>
            <Text content={block.content} />
          </Tag>
        );
      })}
    </>
  );
}

/** The changes in each version, rendered from CHANGELOG.md. */
export function WhatsNew() {
  return (
    <div className="changelog">
      {VERSIONS.map(({ version, blocks }) => (
        <article key={version} className="release" aria-labelledby={`release-${version}`}>
          <h3 id={`release-${version}`}>{version}</h3>
          <Blocks blocks={blocks} />
        </article>
      ))}
    </div>
  );
}
