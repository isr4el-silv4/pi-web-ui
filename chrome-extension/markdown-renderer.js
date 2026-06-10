/**
 * Renders markdown text to sanitized HTML using marked + DOMPurify.
 * 
 * marked and DOMPurify are loaded as global scripts in sidepanel.html.
 */

/**
 * Render markdown string to sanitized HTML.
 * @param {string} text - Markdown text to render
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(text) {
  if (!text) return '';

  // Use marked to parse markdown → HTML
  const html = globalThis.marked.parse(text, {
    gfm: true,
    breaks: true,
  });

  // Sanitize to prevent XSS
  return globalThis.DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
  });
}

/**
 * Check if text contains markdown patterns worth rendering.
 * @param {string} text 
 * @returns {boolean}
 */
export function isMarkdown(text) {
  if (!text) return false;
  // Heuristic: if text contains common markdown patterns, render it
  return /[#*`\-[\]>_|!]/.test(text);
}
