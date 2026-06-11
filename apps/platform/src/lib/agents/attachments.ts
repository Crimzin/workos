import type { PostRecord } from "../posts";
import type {
  MentionedNodeContext,
  NodeContext,
  RelativeThread,
} from "./node-context";

export interface AgentAttachmentSource {
  postId: string;
  section: string;
  authorName?: string | null;
}

export interface AgentImageAttachment {
  kind: "image";
  url: string;
  title?: string;
  caption?: string;
  source: AgentAttachmentSource;
}

export type AgentAttachment = AgentImageAttachment;

export interface AgentAttachmentOptions {
  targetPostId?: string;
  maxAttachments?: number;
}

interface BlockNoteBlock {
  type?: unknown;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown;
}

export function extractAgentAttachmentsFromBody(
  body: string | null | undefined,
  source: AgentAttachmentSource
): AgentAttachment[] {
  if (!body) return [];

  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return [];
  }

  if (!Array.isArray(doc)) return [];

  const attachments: AgentAttachment[] = [];
  for (const block of doc) {
    collectAttachmentsFromBlock(block, source, attachments);
  }
  return attachments;
}

export function extractAgentAttachmentsFromPost(
  post: PostRecord,
  section: string
): AgentAttachment[] {
  return extractAgentAttachmentsFromBody(post.body, {
    postId: post.id,
    section,
    authorName: post.actor?.name ?? null,
  });
}

export function extractAgentAttachmentsFromPosts(
  posts: PostRecord[],
  section: string
): AgentAttachment[] {
  return posts.flatMap((post) => extractAgentAttachmentsFromPost(post, section));
}

export function extractAgentAttachmentsFromNodeContext(
  ctx: NodeContext,
  options: AgentAttachmentOptions = {}
): AgentAttachment[] {
  const maxAttachments = options.maxAttachments ?? 20;
  const targetPost = options.targetPostId
    ? ctx.ownThread.find((post) => post.id === options.targetPostId)
    : null;
  const activeSection = `Active thread on "${ctx.node.title}"`;

  const prioritized: AgentAttachment[] = [];
  if (targetPost) {
    prioritized.push(...extractAgentAttachmentsFromPost(targetPost, activeSection));
  }

  const ownPosts = targetPost
    ? ctx.ownThread.filter((post) => post.id !== targetPost.id)
    : ctx.ownThread;

  prioritized.push(
    ...extractAgentAttachmentsFromPosts(ownPosts, activeSection)
  );

  if (ctx.parentThread) {
    prioritized.push(...extractAgentAttachmentsFromRelativeThread(
      ctx.parentThread,
      `Stack thread: "${ctx.parentThread.node.title}"`
    ));
  }

  for (const thread of ctx.siblingThreads) {
    prioritized.push(...extractAgentAttachmentsFromRelativeThread(
      thread,
      `Sibling card: "${thread.node.title}"`
    ));
  }

  for (const thread of ctx.childThreads) {
    prioritized.push(...extractAgentAttachmentsFromRelativeThread(
      thread,
      `Child card: "${thread.node.title}"`
    ));
  }

  for (const node of ctx.mentionedNodes ?? []) {
    prioritized.push(...extractAgentAttachmentsFromMentionedNode(node));
  }

  return prioritized.slice(0, maxAttachments);
}

export function renderAttachmentReferencesForTextOnlyAgent(
  attachments: AgentAttachment[]
): string {
  if (attachments.length === 0) return "";

  return [
    "Attached images:",
    ...attachments.map((attachment) => {
      const source = renderAttachmentSource(attachment);
      const label = attachment.title ?? attachment.caption ?? "image";
      const caption =
        attachment.caption && attachment.caption !== label
          ? ` — ${attachment.caption}`
          : "";
      return `- ${source}: ${label}${caption} (${attachment.url})`;
    }),
  ].join("\n");
}

export function renderAttachmentSource(attachment: AgentAttachment): string {
  return [
    attachment.source.section,
    attachment.source.authorName || null,
  ].filter((part): part is string => Boolean(part)).join(", ");
}

function collectAttachmentsFromBlock(
  value: unknown,
  source: AgentAttachmentSource,
  out: AgentAttachment[]
): void {
  if (!isBlock(value)) return;

  if (value.type === "image") {
    const url = stringProp(value.props, "url") ?? stringProp(value.props, "src");
    if (url) {
      const title =
        stringProp(value.props, "name") ?? stringProp(value.props, "title");
      const caption =
        stringProp(value.props, "caption") ??
        stringProp(value.props, "alt") ??
        stringProp(value.props, "altText");
      out.push({
        kind: "image",
        url,
        ...(title ? { title } : {}),
        ...(caption ? { caption } : {}),
        source,
      });
    }
  }

  if (Array.isArray(value.children)) {
    for (const child of value.children) {
      collectAttachmentsFromBlock(child, source, out);
    }
  }
}

function extractAgentAttachmentsFromRelativeThread(
  thread: RelativeThread,
  section: string
): AgentAttachment[] {
  return extractAgentAttachmentsFromPosts(thread.posts, section);
}

function extractAgentAttachmentsFromMentionedNode(
  node: MentionedNodeContext
): AgentAttachment[] {
  if (!node.found) return [];
  return extractAgentAttachmentsFromPosts(
    node.posts,
    `Mentioned node: "${node.mention.title}"`
  );
}

function isBlock(value: unknown): value is BlockNoteBlock {
  return typeof value === "object" && value !== null;
}

function stringProp(
  props: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = props?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
