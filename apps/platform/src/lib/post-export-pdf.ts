import {
  PDFDocument,
  rgb,
  StandardFonts,
} from "pdf-lib";
import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import {
  exportInlineContentToText,
  exportListTagForBlock,
  POST_EXPORT_WATERMARK_TEXT,
  postBodyToExportBlocks,
} from "./post-export.ts";
import type {
  BlockNoteBlock,
  TableCell,
  TableContent,
} from "./post-export.ts";

interface PostPdfExportInput {
  body: unknown;
  title: string;
}

interface PdfRenderState {
  pdf: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    mono: PDFFont;
  };
  y: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 58;
const MARGIN_BOTTOM = 58;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const PAGE_BACKGROUND = rgb(0.078, 0.161, 0.169);
const TEXT_PRIMARY = rgb(0.98, 0.973, 0.953);
const TEXT_MUTED = rgb(0.784, 0.776, 0.733);
const TEXT_SOFT = rgb(0.659, 0.659, 0.62);
const ACCENT = rgb(0.831, 0.647, 0.455);
const SURFACE = rgb(0.122, 0.227, 0.239);
const BORDER = rgb(0.227, 0.31, 0.318);

export async function postBodyToPdfBuffer({
  body,
  title,
}: PostPdfExportInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitizePdfText(title));
  pdf.setCreator("WorkOS");

  const state: PdfRenderState = {
    pdf,
    page: undefined as unknown as PDFPage,
    pages: [],
    fonts: {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      mono: await pdf.embedFont(StandardFonts.Courier),
    },
    y: 0,
  };
  addPage(state);
  renderBlocks(state, postBodyToExportBlocks(body));
  drawFooters(state);

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function addPage(state: PdfRenderState): void {
  const page = state.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: PAGE_BACKGROUND,
  });
  state.page = page;
  state.pages.push(page);
  state.y = PAGE_HEIGHT - MARGIN_X;
}

function renderBlocks(state: PdfRenderState, blocks: BlockNoteBlock[]): void {
  if (blocks.length === 0) {
    renderParagraph(state, "Document");
    return;
  }

  let orderedIndex = 1;
  for (const block of blocks) {
    if (block.type === "image") continue;
    if (block.type === "table") {
      renderTable(state, block);
      continue;
    }

    const text = normalizePdfText(exportInlineContentToText(block.content));
    if (!text) continue;

    const listTag = exportListTagForBlock(block);
    if (listTag) {
      const prefix = listTag === "ol" ? `${orderedIndex}.` : "-";
      renderListItem(state, prefix, text);
      if (listTag === "ol") orderedIndex += 1;
      continue;
    }
    orderedIndex = 1;

    switch (block.type) {
      case "heading":
        renderHeading(state, text, headingLevelForBlock(block));
        break;
      case "quote":
        renderQuote(state, text);
        break;
      case "codeBlock":
        renderCodeBlock(state, text);
        break;
      default:
        renderParagraph(state, text);
        break;
    }
  }
}

function renderHeading(
  state: PdfRenderState,
  text: string,
  level: number
): void {
  const size = level === 1 ? 22 : level === 2 ? 17 : 14;
  const topGap = level === 1 ? 22 : 17;
  const lines = wrapText(text, state.fonts.bold, size, CONTENT_WIDTH);
  ensureSpace(state, topGap + lines.length * (size + 6) + 10);
  state.y -= topGap;
  drawLines(state, lines, {
    font: state.fonts.bold,
    size,
    color: level === 1 ? TEXT_PRIMARY : ACCENT,
    lineHeight: size + 6,
  });
  state.y -= 8;
}

function renderParagraph(state: PdfRenderState, text: string): void {
  drawWrappedBlock(state, text, {
    font: state.fonts.regular,
    size: 12,
    color: TEXT_MUTED,
    lineHeight: 17,
    after: 12,
  });
}

function renderListItem(
  state: PdfRenderState,
  prefix: string,
  text: string
): void {
  const textX = MARGIN_X + 30;
  const width = CONTENT_WIDTH - 30;
  const lines = wrapText(text, state.fonts.regular, 12, width);
  ensureSpace(state, Math.max(24, lines.length * 17 + 8));

  state.page.drawText(prefix, {
    x: MARGIN_X + 10,
    y: state.y - 12,
    size: 12,
    font: state.fonts.bold,
    color: ACCENT,
  });

  drawLines(state, lines, {
    x: textX,
    width,
    font: state.fonts.regular,
    size: 12,
    color: TEXT_MUTED,
    lineHeight: 17,
  });
  state.y -= 8;
}

function renderQuote(state: PdfRenderState, text: string): void {
  const lines = wrapText(text, state.fonts.italic, 12, CONTENT_WIDTH - 18);
  const height = lines.length * 17 + 10;
  ensureSpace(state, height + 10);

  state.page.drawRectangle({
    x: MARGIN_X,
    y: state.y - height + 4,
    width: 3,
    height: height - 2,
    color: ACCENT,
  });
  drawLines(state, lines, {
    x: MARGIN_X + 16,
    width: CONTENT_WIDTH - 16,
    font: state.fonts.italic,
    size: 12,
    color: TEXT_SOFT,
    lineHeight: 17,
  });
  state.y -= 12;
}

function renderCodeBlock(state: PdfRenderState, text: string): void {
  const lines = wrapText(text, state.fonts.mono, 10, CONTENT_WIDTH - 24);
  const height = Math.max(42, lines.length * 14 + 22);
  ensureSpace(state, height + 12);

  state.page.drawRectangle({
    x: MARGIN_X,
    y: state.y - height,
    width: CONTENT_WIDTH,
    height,
    color: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
  });

  state.y -= 12;
  drawLines(state, lines, {
    x: MARGIN_X + 12,
    width: CONTENT_WIDTH - 24,
    font: state.fonts.mono,
    size: 10,
    color: TEXT_MUTED,
    lineHeight: 14,
  });
  state.y -= 10;
}

function renderTable(state: PdfRenderState, block: BlockNoteBlock): void {
  if (!isTableContent(block.content) || block.content.rows.length === 0) {
    return;
  }

  const rows = block.content.rows
    .map((row) => (row.cells ?? []).map(tableCellToText))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return;

  const columnCount = Math.max(...rows.map((row) => row.length));
  const columnWidth = CONTENT_WIDTH / columnCount;

  for (const row of rows) {
    const wrappedCells = Array.from({ length: columnCount }, (_, index) =>
      wrapText(row[index] ?? "", state.fonts.regular, 10, columnWidth - 14)
    );
    const rowHeight = Math.max(
      28,
      ...wrappedCells.map((lines) => lines.length * 14 + 14)
    );
    ensureSpace(state, rowHeight + 8);

    const y = state.y - rowHeight;
    for (let index = 0; index < columnCount; index++) {
      const x = MARGIN_X + index * columnWidth;
      state.page.drawRectangle({
        x,
        y,
        width: columnWidth,
        height: rowHeight,
        color: SURFACE,
        borderColor: BORDER,
        borderWidth: 1,
      });
      drawLinesAt(state, wrappedCells[index], {
        x: x + 7,
        y: state.y - 17,
        font: state.fonts.regular,
        size: 10,
        color: TEXT_MUTED,
        lineHeight: 14,
      });
    }

    state.y = y;
  }

  state.y -= 14;
}

function drawWrappedBlock(
  state: PdfRenderState,
  text: string,
  options: {
    font: PDFFont;
    size: number;
    color: RGB;
    lineHeight: number;
    after: number;
  }
): void {
  const lines = wrapText(text, options.font, options.size, CONTENT_WIDTH);
  ensureSpace(state, lines.length * options.lineHeight + options.after);
  drawLines(state, lines, {
    font: options.font,
    size: options.size,
    color: options.color,
    lineHeight: options.lineHeight,
  });
  state.y -= options.after;
}

function drawLines(
  state: PdfRenderState,
  lines: string[],
  options: {
    x?: number;
    width?: number;
    font: PDFFont;
    size: number;
    color: RGB;
    lineHeight: number;
  }
): void {
  drawLinesAt(state, lines, {
    x: options.x ?? MARGIN_X,
    y: state.y - options.size,
    font: options.font,
    size: options.size,
    color: options.color,
    lineHeight: options.lineHeight,
  });
  state.y -= lines.length * options.lineHeight;
}

function drawLinesAt(
  state: PdfRenderState,
  lines: string[],
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: RGB;
    lineHeight: number;
  }
): void {
  lines.forEach((line, index) => {
    state.page.drawText(line, {
      x: options.x,
      y: options.y - index * options.lineHeight,
      size: options.size,
      font: options.font,
      color: options.color,
    });
  });
}

function drawFooters(state: PdfRenderState): void {
  for (const page of state.pages) {
    const text = POST_EXPORT_WATERMARK_TEXT;
    const size = 9;
    const textWidth = state.fonts.bold.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: PAGE_WIDTH - MARGIN_X - textWidth,
      y: 42,
      size,
      font: state.fonts.bold,
      color: ACCENT,
    });
  }
}

function ensureSpace(state: PdfRenderState, height: number): void {
  if (state.y - height < MARGIN_BOTTOM) {
    addPage(state);
  }
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const paragraphs = sanitizePdfText(text).split(/\r?\n/);
  return paragraphs.flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        const broken = breakLongWord(word, font, size, maxWidth);
        lines.push(...broken.slice(0, -1));
        current = broken.at(-1) ?? "";
      }
    }
    if (current) lines.push(current);
    return lines;
  });
}

function breakLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = `${current}${char}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = char;
  }
  if (current) lines.push(current);
  return lines;
}

function headingLevelForBlock(block: BlockNoteBlock): number {
  const level = typeof block.props?.level === "number" ? block.props.level : 1;
  return Math.max(1, Math.min(3, Math.round(level)));
}

function normalizePdfText(text: string): string {
  return sanitizePdfText(text).replace(/\s+/g, " ").trim();
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function tableCellToText(cell: TableCell): string {
  if (typeof cell === "string") return normalizePdfText(cell);
  if (Array.isArray(cell)) return normalizePdfText(exportInlineContentToText(cell));
  return normalizePdfText(exportInlineContentToText(cell.content));
}

function isTableContent(
  content: BlockNoteBlock["content"]
): content is Required<TableContent> {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    content.type === "tableContent" &&
    Array.isArray(content.rows)
  );
}
