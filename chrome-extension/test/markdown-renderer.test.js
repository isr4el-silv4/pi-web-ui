import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { renderMarkdown, isMarkdown } from '../markdown-renderer.js';

describe('markdown renderer', () => {
  // Mock marked and DOMPurify globals
  beforeAll(() => {
    globalThis.marked = {
      parse(text, options) {
        // Simple mock that converts basic markdown patterns
        let html = text;
        // Code blocks FIRST (before inline code breaks backticks)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
        // Headings
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Inline code
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');
        // Links
        html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
        // Unordered lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
        // Paragraphs (double newline)
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        return html;
      },
    };
    globalThis.DOMPurify = {
      sanitize(html, options) {
        // Simple mock — strip script tags, keep everything else
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      },
    };
  });

  afterAll(() => {
    delete globalThis.marked;
    delete globalThis.DOMPurify;
  });

  it('renders headings', () => {
    const result = renderMarkdown('# Title');
    expect(result).toContain('<h1>Title</h1>');
  });

  it('renders bold and italic', () => {
    const result = renderMarkdown('**bold** and *italic*');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  it('renders inline code', () => {
    const result = renderMarkdown('Use `console.log()`');
    expect(result).toContain('<code>console.log()</code>');
  });

  it('renders code blocks', () => {
    const result = renderMarkdown('```js\nconst x = 1;\n```');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code');
    expect(result).toContain('const x = 1;');
  });

  it('renders links', () => {
    const result = renderMarkdown('[Click here](https://example.com)');
    expect(result).toContain('<a href="https://example.com">Click here</a>');
  });

  it('renders lists', () => {
    const result = renderMarkdown('- item 1\n- item 2');
    expect(result).toContain('<li>item 1</li>');
    expect(result).toContain('<li>item 2</li>');
  });

  it('sanitizes script tags', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('returns empty string for null/undefined', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('isMarkdown detects markdown patterns', () => {
    expect(isMarkdown('# Heading')).toBe(true);
    expect(isMarkdown('**bold**')).toBe(true);
    expect(isMarkdown('`code`')).toBe(true);
    expect(isMarkdown('- list')).toBe(true);
    expect(isMarkdown('[link](url)')).toBe(true);
  });

  it('isMarkdown returns false for plain text', () => {
    expect(isMarkdown('Hello world')).toBe(false);
    expect(isMarkdown('Just some plain text')).toBe(false);
    expect(isMarkdown('')).toBe(false);
    expect(isMarkdown(null)).toBe(false);
  });
});
