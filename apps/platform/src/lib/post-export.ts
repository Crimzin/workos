interface PdfExportablePost {
  post_type: string;
  body: string | null;
}

export interface BlockNoteBlock {
  type?: string;
  props?: Record<string, unknown>;
  content?: InlineContent[] | string | TableContent;
  children?: BlockNoteBlock[];
}

export interface TableContent {
  type?: string;
  rows?: { cells?: TableCell[] }[];
}

export type InlineContent =
  | string
  | {
      type?: string;
      text?: string;
      href?: string;
      styles?: Record<string, boolean>;
      props?: Record<string, unknown>;
      content?: InlineContent[];
    };

export type TableCell =
  | string
  | InlineContent[]
  | {
      type?: string;
      content?: InlineContent[] | string;
    };

export const POST_EXPORT_WATERMARK_TEXT = "By Will Corbett via WI LLC";

export function postPdfExportPath(postId: string): string {
  return `/posts/${encodeURIComponent(postId)}/export`;
}

export function postPdfDownloadPath(postId: string): string {
  return `${postPdfExportPath(postId)}/pdf`;
}

export function postDocxDownloadPath(postId: string): string {
  return `${postPdfExportPath(postId)}/docx`;
}

export function pdfFileNameForPostTitle(title: string): string {
  return `${slugForPostExportTitle(title) || "document"}.pdf`;
}

export function docxFileNameForPostTitle(title: string): string {
  return `${slugForPostExportTitle(title) || "document"}.docx`;
}

function slugForPostExportTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug;
}

export function canExportPostToPdf(post: PdfExportablePost): boolean {
  return post.post_type === "post" && Boolean(post.body?.trim());
}

export function postPdfExportDocumentTitle(body: unknown): string {
  const blocks = postBodyToExportBlocks(body);
  for (const block of blocks) {
    const text = normalizeDocumentTitleText(exportInlineContentToText(block.content));
    if (text) return truncateDocumentTitle(text);
  }
  return "Document";
}

export function postBodyToExportHtml(body: unknown): string {
  const blocks = postBodyToExportBlocks(body);
  const html: string[] = [];
  let activeList: "ul" | "ol" | null = null;

  for (const block of blocks) {
    const listTag = exportListTagForBlock(block);
    if (listTag) {
      if (activeList && activeList !== listTag) {
        html.push(`</${activeList}>`);
        activeList = null;
      }
      if (!activeList) {
        html.push(`<${listTag}>`);
        activeList = listTag;
      }
      html.push(`<li>${blockToExportHtml(block, true)}</li>`);
      continue;
    }

    if (activeList) {
      html.push(`</${activeList}>`);
      activeList = null;
    }

    const blockHtml = blockToExportHtml(block, false);
    if (blockHtml) html.push(blockHtml);
  }

  if (activeList) html.push(`</${activeList}>`);
  return html.join("");
}

export function postBodyToExportBlocks(body: unknown): BlockNoteBlock[] {
  const normalized = normalizePostBody(body);
  if (Array.isArray(normalized)) return normalized as BlockNoteBlock[];
  if (typeof normalized !== "string") return [];
  return normalized
    .split(/\r?\n/)
    .map((line) => ({ type: "paragraph", content: line }));
}

function normalizePostBody(body: unknown): unknown {
  let current = body;

  for (let index = 0; index < 3; index++) {
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
  return value.startsWith("[") || value.startsWith("{");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function exportInlineContentToText(content: BlockNoteBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(inlineToText).join("");
}

function inlineToText(inline: InlineContent): string {
  if (typeof inline === "string") return inline;
  if (inline.type === "mention" || inline.type === "nodeMention") return "";
  if (Array.isArray(inline.content)) return inline.content.map(inlineToText).join("");
  return inline.text ?? "";
}

function normalizeDocumentTitleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateDocumentTitle(text: string): string {
  if (text.length <= 90) return text;
  return `${text.slice(0, 87).trimEnd()}...`;
}

export function exportListTagForBlock(block: BlockNoteBlock): "ul" | "ol" | null {
  if (block.type === "bulletListItem" || block.type === "checkListItem") {
    return "ul";
  }
  if (block.type === "numberedListItem") return "ol";
  return null;
}

function blockToExportHtml(block: BlockNoteBlock, listItemContent: boolean): string {
  if (block.type === "table") return tableToExportHtml(block.content);
  if (block.type === "image") return imageToExportHtml(block);

  const content = inlineContentToHtml(block.content);
  if (!content.trim()) return "";

  if (listItemContent) {
    if (block.type === "checkListItem") {
      const checked = block.props?.checked ? "checked" : "unchecked";
      return `<span class="post-export-check ${checked}">${block.props?.checked ? "✓" : ""}</span>${content}`;
    }
    return content;
  }

  switch (block.type) {
    case "heading": {
      const level = clampHeadingLevel(block.props?.level);
      return `<h${level}>${content}</h${level}>`;
    }
    case "quote":
      return `<blockquote>${content}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${content}</code></pre>`;
    default:
      return `<p>${content}</p>`;
  }
}

function inlineContentToHtml(content: BlockNoteBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return escapeHtml(content);
  if (!Array.isArray(content)) return "";
  return content.map(inlineToHtml).join("");
}

function inlineToHtml(inline: InlineContent): string {
  if (typeof inline === "string") return escapeHtml(inline);
  if (inline.type === "mention" || inline.type === "nodeMention") return "";
  if (inline.type === "link") {
    const label = inlineContentToHtml(inline.content ?? []);
    const href = safeHref(inline.href);
    return href ? `<a href="${escapeAttribute(href)}">${label}</a>` : label;
  }

  return applyInlineHtmlStyles(escapeHtml(inline.text ?? ""), inline.styles ?? {});
}

function applyInlineHtmlStyles(
  text: string,
  styles: Record<string, boolean>
): string {
  let out = text;
  if (styles.code) out = `<code>${out}</code>`;
  if (styles.bold) out = `<strong>${out}</strong>`;
  if (styles.italic) out = `<em>${out}</em>`;
  if (styles.strike) out = `<s>${out}</s>`;
  if (styles.underline) out = `<u>${out}</u>`;
  return out;
}

function tableToExportHtml(content: BlockNoteBlock["content"]): string {
  if (!isTableContent(content) || content.rows.length === 0) return "";
  const rows = content.rows
    .map((row) => {
      const cells = (row.cells ?? [])
        .map((cell) => `<td>${tableCellToExportHtml(cell)}</td>`)
        .join("");
      return cells ? `<tr>${cells}</tr>` : "";
    })
    .filter(Boolean)
    .join("");

  return rows ? `<table><tbody>${rows}</tbody></table>` : "";
}

function tableCellToExportHtml(cell: TableCell): string {
  if (typeof cell === "string") return escapeHtml(cell);
  if (Array.isArray(cell)) return inlineContentToHtml(cell);
  return inlineContentToHtml(cell.content);
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

function imageToExportHtml(block: BlockNoteBlock): string {
  const url = block.props?.url;
  if (typeof url !== "string" || !safeHref(url)) return "";
  const caption =
    typeof block.props?.caption === "string" && block.props.caption.trim()
      ? `<figcaption>${escapeHtml(block.props.caption)}</figcaption>`
      : "";
  return `<figure><img src="${escapeAttribute(url)}" alt="" />${caption}</figure>`;
}

function clampHeadingLevel(level: unknown): number {
  if (typeof level !== "number") return 1;
  return Math.max(1, Math.min(3, Math.round(level)));
}

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("/") ||
    href.startsWith("data:image/")
  ) {
    return href;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
