import {
  parseFragment,
  serialize,
  type DefaultTreeAdapterTypes,
} from "parse5";

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type ElementNode = DefaultTreeAdapterTypes.Element;
type TextNode = DefaultTreeAdapterTypes.TextNode;

interface ClipboardPayloadInput {
  html: string;
  blockNoteHtml?: string;
}

export interface PostClipboardPayload {
  html: string;
  text: string;
  blockNoteHtml?: string;
}

const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const blockTags = new Set([
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
]);

const droppedTags = new Set([
  "button",
  "canvas",
  "embed",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "textarea",
]);

const uiOnlyClasses = new Set([
  "bn-drag-handle",
  "bn-drag-handle-menu",
  "bn-formatting-toolbar",
  "bn-side-menu",
  "bn-suggestion-menu",
  "bn-table-add-or-remove-columns",
  "bn-table-add-or-remove-rows",
  "bn-table-handle",
  "bn-table-handle-menu",
  "ProseMirror-gapcursor",
  "ProseMirror-selectednode",
  "ProseMirror-separator",
  "ProseMirror-trailingBreak",
  "ProseMirror-widget",
]);

const tableSectionTags = new Set(["tbody", "thead", "tfoot"]);

const inlineWhitespaceContainerTags = new Set([
  "a",
  "blockquote",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "p",
  "pre",
  "s",
  "strong",
  "td",
  "th",
  "u",
]);

export function buildPostClipboardPayload(
  input: ClipboardPayloadInput
): PostClipboardPayload {
  const html = sanitizePostClipboardHtml(input.html);
  const text = clipboardHtmlToPlainText(html);

  return {
    html,
    text,
    ...(input.blockNoteHtml ? { blockNoteHtml: input.blockNoteHtml } : {}),
  };
}

export function sanitizePostClipboardHtml(html: string): string {
  const fragment = parseFragment(html);
  fragment.childNodes = cleanChildrenForParent(
    fragment.childNodes.flatMap((node) => sanitizeNode(node)),
    undefined
  );
  return serialize(fragment);
}

export function clipboardHtmlToPlainText(html: string): string {
  const fragment = parseFragment(html);
  return normalizePlainText(
    fragment.childNodes.map((node) => nodeToText(node)).join("")
  );
}

function sanitizeNode(node: ChildNode): ChildNode[] {
  if (isTextNode(node)) {
    node.value = node.value.replace(/\s+/g, " ");
    return [node];
  }

  if (!isElementNode(node) || isUiOnlyElement(node)) {
    return [];
  }

  const sourceTag = node.tagName.toLowerCase();
  if (droppedTags.has(sourceTag)) {
    return [];
  }

  const contentType = getAttribute(node, "data-content-type");
  const tag = semanticTagForElement(node, sourceTag, contentType);
  const children = node.childNodes.flatMap((child) => sanitizeNode(child));

  if (!tag || !allowedTags.has(tag)) {
    return cleanChildrenForParent(children, undefined);
  }

  if (contentType === "table" && tag !== "table") {
    return cleanChildrenForParent(children, undefined);
  }

  node.tagName = tag;
  node.nodeName = tag;
  node.attrs = allowedAttributes(node, tag);
  node.childNodes =
    tag === "br" ? [] : cleanChildrenForParent(children, tag);

  if (blockTags.has(tag)) {
    trimInlineBoundaryWhitespace(node.childNodes);
  }

  if (isEffectivelyEmpty(node)) {
    return [];
  }

  return [node];
}

function semanticTagForElement(
  node: ElementNode,
  sourceTag: string,
  contentType: string | undefined
): string | undefined {
  if (contentType === "paragraph") return "p";
  if (contentType === "heading") return headingTagForElement(node);
  if (contentType === "table") {
    return sourceTag === "table" ? "table" : undefined;
  }

  switch (sourceTag) {
    case "b":
      return "strong";
    case "i":
      return "em";
    case "strike":
      return "s";
    default:
      return sourceTag;
  }
}

function headingTagForElement(node: ElementNode): string {
  const level = Number(
    getAttribute(node, "data-level") ?? getAttribute(node, "aria-level")
  );
  if (!Number.isFinite(level)) return "h1";
  return `h${Math.max(1, Math.min(6, Math.round(level)))}`;
}

function allowedAttributes(node: ElementNode, tag: string): ElementNode["attrs"] {
  const attrs: ElementNode["attrs"] = [];

  if (tag === "a") {
    const href = getAttribute(node, "href");
    if (href && isSafeHref(href)) {
      attrs.push({ name: "href", value: href });
    }
  }

  if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"]) {
      const value = getAttribute(node, name);
      if (value && /^[1-9]\d*$/.test(value)) {
        attrs.push({ name, value });
      }
    }
  }

  if (tag === "ol") {
    const start = getAttribute(node, "start");
    if (start && /^[1-9]\d*$/.test(start)) {
      attrs.push({ name: "start", value: start });
    }
  }

  return attrs;
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed)
  );
}

function cleanChildrenForParent(
  children: ChildNode[],
  parentTag: string | undefined
): ChildNode[] {
  if (parentTag && isPhrasingContainer(parentTag)) {
    return children;
  }

  return children.filter(
    (child) => !isTextNode(child) || child.value.trim() !== ""
  );
}

function trimInlineBoundaryWhitespace(children: ChildNode[]): void {
  while (children.length > 0 && isTextNode(children[0])) {
    const trimmed = children[0].value.trimStart();
    if (trimmed) {
      children[0].value = trimmed;
      break;
    }
    children.shift();
  }

  while (children.length > 0 && isTextNode(children[children.length - 1])) {
    const last = children[children.length - 1] as TextNode;
    const trimmed = last.value.trimEnd();
    if (trimmed) {
      last.value = trimmed;
      break;
    }
    children.pop();
  }
}

function isPhrasingContainer(tag: string): boolean {
  return inlineWhitespaceContainerTags.has(tag) && !tableSectionTags.has(tag);
}

function isEffectivelyEmpty(node: ElementNode): boolean {
  if (node.tagName === "br") return false;
  if (node.tagName === "td" || node.tagName === "th") return false;
  if (node.tagName === "table") return node.childNodes.length === 0;
  return node.childNodes.length === 0 && blockTags.has(node.tagName);
}

function nodeToText(node: ChildNode): string {
  if (isTextNode(node)) {
    return node.value.replace(/\s+/g, " ");
  }

  if (!isElementNode(node)) return "";

  const tag = node.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "table") return tableToText(node);
  if (tag === "tr") return rowToText(node);
  if (tag === "td" || tag === "th") {
    return inlineText(node.childNodes);
  }
  if (tag === "li") {
    return `${inlineText(node.childNodes)}\n`;
  }
  if (tag === "ul" || tag === "ol") {
    return listToText(node, tag === "ol");
  }
  if (blockTags.has(tag)) {
    const text = inlineText(node.childNodes);
    return text ? `${text}\n\n` : "";
  }

  return inlineText(node.childNodes);
}

function listToText(node: ElementNode, ordered: boolean): string {
  const items = node.childNodes
    .filter(isElementNode)
    .filter((child) => child.tagName === "li");
  return items
    .map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : "- ";
      return `${prefix}${inlineText(item.childNodes)}`;
    })
    .join("\n");
}

function tableToText(node: ElementNode): string {
  return collectRows(node).map(rowToText).filter(Boolean).join("\n");
}

function rowToText(row: ElementNode): string {
  return row.childNodes
    .filter(isElementNode)
    .filter((cell) => cell.tagName === "td" || cell.tagName === "th")
    .map((cell) => inlineText(cell.childNodes))
    .join("\t");
}

function collectRows(node: ElementNode): ElementNode[] {
  if (node.tagName === "tr") return [node];

  return node.childNodes
    .filter(isElementNode)
    .flatMap((child) => collectRows(child));
}

function inlineText(children: ChildNode[]): string {
  return normalizeInlineText(
    children.map((child) => nodeToText(child)).join("")
  );
}

function normalizeInlineText(text: string): string {
  return text.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function normalizePlainText(text: string): string {
  return text
    .replace(/[ \f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isUiOnlyElement(node: ElementNode): boolean {
  const className = getAttribute(node, "class");
  if (!className) return false;

  return className
    .split(/\s+/)
    .some((name) => uiOnlyClasses.has(name) || name.startsWith("mantine-"));
}

function getAttribute(node: ElementNode, name: string): string | undefined {
  return node.attrs.find((attr) => attr.name.toLowerCase() === name)?.value;
}

function isTextNode(node: ChildNode): node is TextNode {
  return node.nodeName === "#text";
}

function isElementNode(node: ChildNode): node is ElementNode {
  return "tagName" in node;
}
