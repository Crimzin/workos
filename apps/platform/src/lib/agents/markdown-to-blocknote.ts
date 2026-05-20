// Converts the Markdown text Claude (and other LLMs) typically produce into
// the minimal BlockNote document JSON shape that PostEditor can render. Hand-
// rolled rather than pulling in a full markdown parser because we only need
// the subset Claude actually emits in chat replies:
//
//   Block-level:  # / ## / ### headings, "- " and "* " bullets, "1. " numbered
//                 lists, "> " blockquotes, ``` fenced code blocks, pipe tables,
//                 paragraphs
//   Inline:       **bold**, *italic* / _italic_, `inline code`, [text](url)
//
// Anything we don't recognise becomes plain text. This is a v1 polished
// follow-up on top of the v1 minimum text-only renderer.
//
// Output shape matches what `PostEditor.serializePostBody` produces, so
// `parsePostBody` can read it back transparently. We only emit the keys
// BlockNote needs to render — props like `backgroundColor` etc. fall back to
// BlockNote defaults when omitted.
//
// Test cases live in markdown-to-blocknote.test.ts (TODO follow-up).

interface InlineStyles {
  bold?: true;
  italic?: true;
  code?: true;
}

interface InlineText {
  type: "text";
  text: string;
  styles: InlineStyles;
}

interface InlineLink {
  type: "link";
  href: string;
  content: InlineText[];
}

type Inline = InlineText | InlineLink;

interface TableCell {
  type: "tableCell";
  content: Inline[];
}

interface TableContent {
  type: "tableContent";
  rows: { cells: TableCell[] }[];
}

export interface MarkdownBlock {
  type: string;
  props?: Record<string, unknown>;
  content: Inline[] | TableContent;
  children?: MarkdownBlock[];
}

export function markdownToBlockNote(input: string): MarkdownBlock[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — paragraph separator. Skip.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block: ``` ... ```
    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++; // consume opening fence
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence (if present)
      blocks.push({
        type: "codeBlock",
        content: [{ type: "text", text: codeLines.join("\n"), styles: {} }],
      });
      continue;
    }

    // Heading: # / ## / ### (BlockNote supports levels 1-3)
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      blocks.push({
        type: "heading",
        props: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    // Pipe table:
    // | Header | Header |
    // | --- | --- |
    // | Cell | Cell |
    if (isTableStart(lines, i)) {
      const rows: { cells: TableCell[] }[] = [
        { cells: parseTableRow(lines[i]) },
      ];
      i += 2; // consume header + separator
      while (i < lines.length && isTableDataRow(lines[i])) {
        rows.push({ cells: parseTableRow(lines[i]) });
        i++;
      }
      blocks.push({
        type: "table",
        content: { type: "tableContent", rows },
      });
      continue;
    }

    // Blockquote: contiguous "> " lines collapse into one quote block.
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "quote",
        content: parseInline(quoteLines.join(" ")),
      });
      continue;
    }

    // Bulleted list: each "- " or "* " line becomes its own bulletListItem
    // block. We don't try to handle nested lists in v1.
    if (/^[-*]\s+/.test(line)) {
      while (i < lines.length) {
        const m = lines[i].match(/^[-*]\s+(.*)$/);
        if (!m) break;
        blocks.push({
          type: "bulletListItem",
          content: parseInline(m[1]),
        });
        i++;
      }
      continue;
    }

    // Numbered list: same pattern as bullets.
    if (/^\d+\.\s+/.test(line)) {
      while (i < lines.length) {
        const m = lines[i].match(/^\d+\.\s+(.*)$/);
        if (!m) break;
        blocks.push({
          type: "numberedListItem",
          content: parseInline(m[1]),
        });
        i++;
      }
      continue;
    }

    // Paragraph — collect until blank line or until we hit another block-level
    // construct. Lines join with a space so wrapped sentences read cleanly.
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim() === "") break;
      if (
        /^```/.test(next) ||
        /^#{1,3}\s+/.test(next) ||
        isTableStart(lines, i) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^>\s?/.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        content: parseInline(paragraphLines.join(" ")),
      });
    }
  }

  // BlockNote needs at least one block to render anything.
  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: [] });
  }
  return blocks;
}

function isTableStart(lines: string[], index: number): boolean {
  return (
    isTableDataRow(lines[index]) &&
    index + 1 < lines.length &&
    isTableSeparatorRow(lines[index + 1])
  );
}

function isTableDataRow(line: string | undefined): boolean {
  if (!line) return false;
  return /^\s*\|.+\|\s*$/.test(line) && !isTableSeparatorRow(line);
}

function isTableSeparatorRow(line: string | undefined): boolean {
  if (!line) return false;
  const cells = splitTableCells(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function parseTableRow(line: string): TableCell[] {
  return splitTableCells(line).map((cell) => ({
    type: "tableCell",
    content: parseInline(cell),
  }));
}

function splitTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

/**
 * Walk a single line/paragraph and split it into BlockNote inline content.
 * Recognises the inline patterns Claude emits most often. Multi-character
 * delimiters (** before *) are tested before single-character ones so we
 * don't accidentally chop a `**bold**` run into two italic pieces.
 */
function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  let i = 0;

  const flushBuf = () => {
    if (buf.length > 0) {
      out.push({ type: "text", text: buf, styles: {} });
      buf = "";
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // **bold**
    const bold = rest.match(/^\*\*((?:[^*]|\*(?!\*))+?)\*\*/);
    if (bold) {
      flushBuf();
      out.push({ type: "text", text: bold[1], styles: { bold: true } });
      i += bold[0].length;
      continue;
    }

    // *italic* — must not match the start of **; the bold check above wins.
    const italicStar = rest.match(/^\*([^*\n]+?)\*/);
    if (italicStar) {
      flushBuf();
      out.push({ type: "text", text: italicStar[1], styles: { italic: true } });
      i += italicStar[0].length;
      continue;
    }

    // _italic_
    const italicUnder = rest.match(/^_([^_\n]+?)_/);
    if (italicUnder) {
      flushBuf();
      out.push({
        type: "text",
        text: italicUnder[1],
        styles: { italic: true },
      });
      i += italicUnder[0].length;
      continue;
    }

    // `inline code`
    const code = rest.match(/^`([^`\n]+?)`/);
    if (code) {
      flushBuf();
      out.push({ type: "text", text: code[1], styles: { code: true } });
      i += code[0].length;
      continue;
    }

    // [text](url)
    const link = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/);
    if (link) {
      flushBuf();
      out.push({
        type: "link",
        href: link[2],
        content: [{ type: "text", text: link[1], styles: {} }],
      });
      i += link[0].length;
      continue;
    }

    // Plain character — accumulate.
    buf += text[i];
    i++;
  }

  flushBuf();
  // Empty content arrays are fine in BlockNote (renders an empty line).
  return out;
}
