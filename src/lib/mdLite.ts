/**
 * Tiny, dependency-free markdown <-> HTML / TipTap-JSON helpers.
 *
 * Purpose: Stage 3 stores draft bodies as TipTap JSON (DraftVersion.doc) AND
 * as a markdown-ish plain_text string (for diffing in Stage 4 and for feeding
 * subsequent prompts). The first draft arrives from Stage 2 as markdown, so
 * we need to hydrate TipTap with HTML on first load. Going the other way,
 * TipTap's `getText()` loses structure — we walk the JSON doc to recover
 * headers, lists, and emphasis.
 *
 * Scope: intentionally minimal. Handles:
 *   - Headings `#`, `##`, `###`
 *   - Paragraphs (blank-line separated)
 *   - Unordered lists `- item`
 *   - Ordered lists `1. item`
 *   - Bold `**x**` and italic `*x*`
 *   - Inline code `` `x` ``
 *   - Fenced code blocks ``` ```
 *
 * Anything fancier (tables, images, links with titles, blockquotes) is
 * intentionally out of scope — the author can still edit it as plain text.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMd(s: string): string {
  // Escape first, then apply inline formatting to the escaped string.
  let out = escapeHtml(s);
  // Inline code — consume first so we don't re-match ** or * inside.
  out = out.replace(/`([^`]+)`/g, (_m, body: string) => `<code>${body}</code>`);
  // Bold before italic so **x** isn't misread as *<em>x</em>*.
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // Skip closing fence.
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // Heading.
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list.
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^\s*-\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blank line.
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    // Paragraph: collect until blank line or block-starting line.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^(#{1,3}\s+|```|\s*-\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inlineMd(buf.join(' '))}</p>`);
  }

  return out.join('');
}

// ---------- TipTap JSON -> markdown ----------

interface Mark {
  type: string;
}
interface Node {
  type: string;
  content?: Node[];
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
}

function renderMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const m of marks) {
    if (m.type === 'bold') out = `**${out}**`;
    else if (m.type === 'italic') out = `*${out}*`;
    else if (m.type === 'code') out = `\`${out}\``;
  }
  return out;
}

function renderInline(nodes: Node[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'text') return renderMarks(n.text ?? '', n.marks);
      if (n.type === 'hardBreak') return '\n';
      return '';
    })
    .join('');
}

/**
 * Convert a TipTap JSON document back to markdown. Inverse of markdownToHtml
 * for the subset of nodes we use.
 */
export function docToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const root = doc as Node;
  if (!Array.isArray(root.content)) return '';

  const out: string[] = [];
  for (const node of root.content) {
    switch (node.type) {
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
        out.push(`${'#'.repeat(level)} ${renderInline(node.content)}`);
        break;
      }
      case 'paragraph':
        out.push(renderInline(node.content));
        break;
      case 'bulletList':
        for (const item of node.content ?? []) {
          const inner = (item.content ?? [])
            .map((c) => (c.type === 'paragraph' ? renderInline(c.content) : ''))
            .join(' ');
          out.push(`- ${inner}`);
        }
        break;
      case 'orderedList': {
        let n = 1;
        for (const item of node.content ?? []) {
          const inner = (item.content ?? [])
            .map((c) => (c.type === 'paragraph' ? renderInline(c.content) : ''))
            .join(' ');
          out.push(`${n}. ${inner}`);
          n++;
        }
        break;
      }
      case 'codeBlock': {
        const text = (node.content ?? [])
          .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
          .join('');
        out.push('```');
        out.push(text);
        out.push('```');
        break;
      }
      default:
        // Unknown block — flatten its text content.
        out.push(renderInline(node.content));
    }
    out.push('');
  }
  // Drop trailing blank.
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
