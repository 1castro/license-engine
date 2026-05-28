import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../../src/components/changelog-render';

function html(md: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(md)}</>);
}

describe('renderMarkdown (changelog)', () => {
  it('renders ## version headings as <h3>', () => {
    expect(html('## [1.0.0] - 2026-05-28')).toContain('<h3');
    expect(html('## [1.0.0] - 2026-05-28')).toContain('[1.0.0] - 2026-05-28');
  });

  it('renders ### category headings as <h4>', () => {
    expect(html('### Sicherheit')).toContain('<h4');
  });

  it('renders "- " lines as a <ul><li> list', () => {
    const out = html('- Punkt A\n- Punkt B');
    expect(out).toContain('<ul');
    expect((out.match(/<li/g) ?? []).length).toBe(2);
  });

  it('renders **bold** as <strong> and `code` as <code>', () => {
    expect(html('- ein **wichtiger** Punkt')).toContain('<strong');
    expect(html('- nutze `pnpm build`')).toContain('<code');
  });

  it('renders --- as <hr>', () => {
    expect(html('---')).toContain('<hr');
  });

  // The renderer must never emit raw HTML from the content — defense against a
  // future changelog edit (or a compromised file) carrying markup.
  it('escapes HTML in the content (no XSS injection)', () => {
    const out = html('- <img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders the real CHANGELOG header without throwing', () => {
    const sample = '# License Engine — Changelog\n\nText.\n\n## [1.0.0] - 2026-05-28 — Release\n\n### Hinzugefügt\n- Punkt\n';
    expect(() => html(sample)).not.toThrow();
    expect(html(sample)).toContain('License Engine');
  });
});
