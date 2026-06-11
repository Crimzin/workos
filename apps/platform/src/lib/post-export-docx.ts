import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  LevelSuffix,
  Packer,
  Paragraph,
  Table,
  TableCell as DocxTableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
} from "docx";
import type { ParagraphChild } from "docx";
import {
  exportInlineContentToText,
  exportListTagForBlock,
  postBodyToExportBlocks,
} from "./post-export";
import type {
  BlockNoteBlock,
  InlineContent,
  TableCell as ExportTableCell,
  TableContent,
} from "./post-export";

interface GoogleDocsDocxExportInput {
  body: unknown;
  title: string;
}

const BULLET_NUMBERING_REFERENCE = "post-export-bullets";
const ORDERED_NUMBERING_REFERENCE = "post-export-numbering";
const DOCUMENT_WIDTH_DXA = 9360;

export async function postBodyToGoogleDocsDocxBuffer({
  body,
  title,
}: GoogleDocsDocxExportInput): Promise<Buffer> {
  const children = blocksToDocxChildren(postBodyToExportBlocks(body));

  const document = new Document({
    title,
    creator: "",
    lastModifiedBy: "",
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
            color: "000000",
          },
          paragraph: {
            spacing: { after: 160, line: 276 },
          },
        },
        heading1: {
          run: {
            font: "Arial",
            size: 40,
            bold: true,
            color: "000000",
          },
          paragraph: {
            spacing: { before: 420, after: 160 },
            keepNext: true,
          },
        },
        heading2: {
          run: {
            font: "Arial",
            size: 32,
            bold: true,
            color: "000000",
          },
          paragraph: {
            spacing: { before: 320, after: 120 },
            keepNext: true,
          },
        },
        heading3: {
          run: {
            font: "Arial",
            size: 24,
            bold: true,
            color: "000000",
          },
          paragraph: {
            spacing: { before: 220, after: 80 },
            keepNext: true,
          },
        },
        hyperlink: {
          run: {
            color: "1155CC",
            underline: { type: UnderlineType.SINGLE },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLET_NUMBERING_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              suffix: LevelSuffix.TAB,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
        {
          reference: ORDERED_NUMBERING_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              suffix: LevelSuffix.TAB,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children:
          children.length > 0
            ? children
            : [new Paragraph({ text: "Document" })],
      },
    ],
  });

  return Packer.toBuffer(document);
}

function blocksToDocxChildren(blocks: BlockNoteBlock[]): (Paragraph | Table)[] {
  return blocks.flatMap((block) => blockToDocxChildren(block));
}

function blockToDocxChildren(block: BlockNoteBlock): (Paragraph | Table)[] {
  if (block.type === "image") return [];
  if (block.type === "table") {
    const table = blockToDocxTable(block);
    return table ? [table] : [];
  }

  const children = inlineContentToDocxChildren(block.content);
  if (children.length === 0) return [];

  const listTag = exportListTagForBlock(block);
  if (listTag) {
    return [
      new Paragraph({
        children,
        numbering: {
          reference:
            listTag === "ul"
              ? BULLET_NUMBERING_REFERENCE
              : ORDERED_NUMBERING_REFERENCE,
          level: 0,
        },
        spacing: { after: 90 },
      }),
    ];
  }

  switch (block.type) {
    case "heading":
      return [
        new Paragraph({
          children,
          heading: headingLevelForBlock(block),
        }),
      ];
    case "quote":
      return [
        new Paragraph({
          children,
          border: {
            left: {
              style: BorderStyle.SINGLE,
              color: "CCCCCC",
              size: 8,
              space: 12,
            },
          },
          indent: { left: 240 },
          spacing: { before: 160, after: 160 },
        }),
      ];
    case "codeBlock":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: exportInlineContentToText(block.content),
              font: "Courier New",
              size: 20,
            }),
          ],
          spacing: { before: 160, after: 160 },
        }),
      ];
    default:
      return [
        new Paragraph({
          children,
          spacing: { after: 160 },
        }),
      ];
  }
}

function headingLevelForBlock(
  block: BlockNoteBlock
): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const level = typeof block.props?.level === "number" ? block.props.level : 1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level >= 3) return HeadingLevel.HEADING_3;
  return HeadingLevel.HEADING_1;
}

function inlineContentToDocxChildren(
  content: BlockNoteBlock["content"]
): ParagraphChild[] {
  if (!content) return [];
  if (typeof content === "string") return textToRuns(content, {});
  if (!Array.isArray(content)) return [];
  return content.flatMap(inlineToDocxChildren);
}

function inlineToDocxChildren(inline: InlineContent): ParagraphChild[] {
  if (typeof inline === "string") return textToRuns(inline, {});
  if (inline.type === "mention" || inline.type === "nodeMention") return [];

  if (inline.type === "link") {
    const labelRuns = inlineContentToDocxTextRuns(inline.content ?? []);
    const href = safeDocxHref(inline.href);
    if (!href) return labelRuns;

    return [
      new ExternalHyperlink({
        link: href,
        children: labelRuns,
      }),
    ];
  }

  return textToRuns(inline.text ?? "", inline.styles ?? {});
}

function inlineContentToDocxTextRuns(content: InlineContent[]): TextRun[] {
  return content
    .flatMap((inline) => {
      if (typeof inline === "string") return textToRuns(inline, {});
      if (inline.type === "mention" || inline.type === "nodeMention") return [];
      if (inline.type === "link" && Array.isArray(inline.content)) {
        return inlineContentToDocxTextRuns(inline.content);
      }
      return textToRuns(inline.text ?? "", inline.styles ?? {});
    })
    .filter((child): child is TextRun => child instanceof TextRun);
}

function textToRuns(
  text: string,
  styles: Record<string, boolean>
): TextRun[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);

  return lines.flatMap((line, index) => {
    const run = new TextRun({
      text: line,
      bold: styles.bold,
      italics: styles.italic,
      strike: styles.strike,
      underline: styles.underline ? { type: UnderlineType.SINGLE } : undefined,
      font: styles.code ? "Courier New" : "Arial",
      size: styles.code ? 20 : undefined,
    });

    if (index === 0) return [run];
    return [new TextRun({ break: 1 }), run];
  });
}

function blockToDocxTable(block: BlockNoteBlock): Table | null {
  if (!isTableContent(block.content) || block.content.rows.length === 0) {
    return null;
  }

  const maxColumnCount = Math.max(
    ...block.content.rows.map((row) => row.cells?.length ?? 0)
  );
  if (maxColumnCount === 0) return null;

  const columnWidth = Math.floor(DOCUMENT_WIDTH_DXA / maxColumnCount);
  const columnWidths = Array.from({ length: maxColumnCount }, () => columnWidth);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    layout: TableLayoutType.FIXED,
    margins: {
      top: 120,
      bottom: 120,
      left: 120,
      right: 120,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D9D9D9", size: 4 },
      bottom: { style: BorderStyle.SINGLE, color: "D9D9D9", size: 4 },
      left: { style: BorderStyle.SINGLE, color: "D9D9D9", size: 4 },
      right: { style: BorderStyle.SINGLE, color: "D9D9D9", size: 4 },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        color: "D9D9D9",
        size: 4,
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        color: "D9D9D9",
        size: 4,
      },
    },
    rows: block.content.rows.map((row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        children: paddedTableCells(
          row.cells ?? [],
          maxColumnCount,
          columnWidth,
          rowIndex === 0
        ),
      })
    ),
  });
}

function paddedTableCells(
  cells: ExportTableCell[],
  count: number,
  width: number,
  header: boolean
): DocxTableCell[] {
  return Array.from({ length: count }, (_, index) =>
    tableCellToDocxCell(cells[index], width, header)
  );
}

function tableCellToDocxCell(
  cell: ExportTableCell | undefined,
  width: number,
  header: boolean
): DocxTableCell {
  const children = header
    ? [new TextRun({ text: tableCellToText(cell), bold: true })]
    : tableCellToDocxParagraphChildren(cell);

  return new DocxTableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlignTable.TOP,
    margins: {
      top: 120,
      bottom: 120,
      left: 120,
      right: 120,
    },
    shading: header ? { fill: "F1F3F4" } : undefined,
    children: [
      new Paragraph({
        children,
      }),
    ],
  });
}

function tableCellToDocxParagraphChildren(
  cell: ExportTableCell | undefined
): ParagraphChild[] {
  if (!cell) return [new TextRun("")];
  if (typeof cell === "string") return textToRuns(cell, {});
  if (Array.isArray(cell)) return inlineContentToDocxChildren(cell);
  return inlineContentToDocxChildren(cell.content);
}

function tableCellToText(cell: ExportTableCell | undefined): string {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) {
    return exportInlineContentToText(cell);
  }
  return exportInlineContentToText(cell.content);
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

function safeDocxHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return null;
}
