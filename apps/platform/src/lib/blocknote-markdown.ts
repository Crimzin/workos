interface BlockNoteBlock {
  type?: string;
  props?: Record<string, unknown>;
  content?: InlineContent[] | string | TableContent;
  children?: BlockNoteBlock[];
}

interface TableContent {
  type?: string;
  rows?: { cells?: TableCell[] }[];
}

type TableCell =
  | string
  | InlineContent[]
  | {
      type?: string;
      content?: InlineContent[] | string;
    };

type InlineContent =
  | string
  | {
      type?: string;
      text?: string;
      href?: string;
      styles?: Record<string, boolean>;
      props?: Record<string, unknown>;
      content?: InlineContent[];
    };

export function postBodyToMarkdown(body: unknown): string {
  if (!body) return "";
  const normalized = normalizePostBody(body);
  if (Array.isArray(normalized)) {
    return normalized.map((block, index) => blockToMarkdown(block, index)).join("\n\n");
  }
  return typeof normalized === "string" ? normalized : "";
}

function normalizePostBody(body: unknown): unknown {
  let current = body;

  for (let i = 0; i < 3; i++) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!looksLikeJson(trimmed)) return current;
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return current;
      }
    }

    if (isRecord(current)) {
      if (Array.isArray(current.blocks)) return current.blocks;
      if (Array.isArray(current.document)) return current.document;
      if (Array.isArray(current.content)) return current.content;
    }

    return current;
  }

  return current;
}

function looksLikeJson(value: string): boolean {
  return (
    value.startsWith("[") ||
    value.startsWith("{") ||
    value.startsWith("\"[") ||
    value.startsWith("\"{")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function blockToMarkdown(block: BlockNoteBlock, index: number): string {
  if (block.type === "table") {
    return tableToMarkdown(block.content);
  }

  const content = inlineContentToMarkdown(block.content);

  switch (block.type) {
    case "heading": {
      const level = clampHeadingLevel(block.props?.level);
      return `${"#".repeat(level)} ${content}`;
    }
    case "bulletListItem":
      return `- ${content}`;
    case "numberedListItem":
      return `${index + 1}. ${content}`;
    case "checkListItem":
      return `- [${block.props?.checked ? "x" : " "}] ${content}`;
    case "quote":
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock":
      return ["```", content, "```"].join("\n");
    default:
      return content;
  }
}

function inlineContentToMarkdown(content: BlockNoteBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(inlineToMarkdown).join("");
}

function tableToMarkdown(content: BlockNoteBlock["content"]): string {
  if (!isTableContent(content) || content.rows.length === 0) return "";
  const rows = content.rows.map((row) =>
    (row.cells ?? []).map((cell) => tableCellToMarkdown(cell))
  );
  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );
  const [header, ...bodyRows] = normalizedRows;

  return [
    markdownTableRow(header),
    markdownTableRow(Array.from({ length: columnCount }, () => "---")),
    ...bodyRows.map(markdownTableRow),
  ].join("\n");
}

function tableCellToMarkdown(cell: TableCell): string {
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) return inlineContentToMarkdown(cell);
  return inlineContentToMarkdown(cell.content);
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeTableCell).join(" | ")} |`;
}

function escapeTableCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function isTableContent(content: BlockNoteBlock["content"]): content is Required<TableContent> {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    content.type === "tableContent" &&
    Array.isArray(content.rows)
  );
}

function inlineToMarkdown(inline: InlineContent): string {
  if (typeof inline === "string") return inline;
  if (inline.type === "link") {
    const label = inlineContentToMarkdown(inline.content ?? []);
    return `[${label}](${inline.href ?? ""})`;
  }
  if (inline.type === "mention") {
    const name = inline.props?.name;
    return typeof name === "string" ? `@${name}` : "@Unknown";
  }
  if (inline.type === "nodeMention") {
    const title = inline.props?.title;
    return typeof title === "string" ? `#${title}` : "#Unknown";
  }
  return applyInlineStyles(inline.text ?? "", inline.styles ?? {});
}

function applyInlineStyles(text: string, styles: Record<string, boolean>): string {
  let out = text;
  if (styles.code) out = `\`${out}\``;
  if (styles.bold) out = `**${out}**`;
  if (styles.italic) out = `*${out}*`;
  if (styles.strike) out = `~~${out}~~`;
  return out;
}

function clampHeadingLevel(level: unknown): number {
  if (typeof level !== "number") return 1;
  return Math.max(1, Math.min(3, Math.round(level)));
}
