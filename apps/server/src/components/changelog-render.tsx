import { Fragment, type ReactNode } from 'react';

/**
 * Format-specific Markdown renderer for the project CHANGELOG.
 *
 * Renders into React elements (headings, lists, rules, inline **bold** and
 * `code`). We deliberately do NOT use dangerouslySetInnerHTML — every piece of
 * text becomes React children and is therefore auto-escaped, so the renderer
 * has no XSS surface even though the changelog content is trusted.
 */

/** Parses inline `**bold**` and `` `code` `` into React nodes. */
export function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(
        <strong key={i} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code key={i} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.8em]">
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part) {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  });
  return nodes;
}

export function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-neutral-700">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (line.trim() === '') {
      continue;
    }
    if (line === '---') {
      blocks.push(<hr key={key++} className="my-4 border-neutral-200" />);
    } else if (line.startsWith('### ')) {
      blocks.push(
        <h4
          key={key++}
          className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500"
        >
          {renderInline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="mt-5 text-base font-semibold text-neutral-900">
          {renderInline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={key++} className="text-lg font-bold text-neutral-900">
          {renderInline(line.slice(2))}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={key++} className="my-2 text-neutral-700">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();

  return blocks;
}
