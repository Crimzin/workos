"use client";

import "@blocknote/mantine/style.css";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  BlockColorsItem,
  createReactInlineContentSpec,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
  selectedFragmentToHTML,
} from "@blocknote/core";
import type {
  Block,
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  PartialBlock,
  StyleSchema,
} from "@blocknote/core";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
} from "prosemirror-tables";
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActorForMention } from "@/lib/actor";
import type { NodeMentionCandidate } from "@/lib/node-mentions";
import { buildPostClipboardPayload } from "@/lib/post-clipboard";
import { useTheme } from "./theme-provider";

// ---------------------------------------------------------------------------
// Mention inline content spec
// Defined at module level so the schema reference is stable across renders.
// ---------------------------------------------------------------------------

const MentionSpec = createReactInlineContentSpec(
  {
    type: "mention" as const,
    propSchema: {
      id:   { default: "" },
      name: { default: "Unknown" },
      kind: { default: "human" },    // "human" | "agent"
    },
    content: "none" as const,
  },
  {
    render: ({ inlineContent }) => {
      const { name, kind } = inlineContent.props;
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: "0.9em",
            fontWeight: 500,
            background: kind === "agent" ? "var(--agent-accent-bg, rgba(124,58,237,0.12))" : "rgba(var(--accent-rgb, 79,70,229), 0.12)",
            color: kind === "agent" ? "var(--agent-accent, #7C3AED)" : "var(--accent, #4F46E5)",
            cursor: "default",
          }}
          data-mention-id={inlineContent.props.id}
        >
          @{name}
        </span>
      );
    },
  }
);

const NodeMentionSpec = createReactInlineContentSpec(
  {
    type: "nodeMention" as const,
    propSchema: {
      id: { default: "" },
      title: { default: "Untitled" },
      type: { default: "card" },
      path: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ inlineContent }) => {
      const { id, title } = inlineContent.props;
      return (
        <a
          href={`/n/${id}`}
          className="inline-flex items-center rounded-[3px] bg-accent/10 px-[3px] text-[0.9em] font-medium text-accent no-underline hover:bg-accent/15"
          data-node-mention-id={id}
        >
          #{title}
        </a>
      );
    },
  }
);

// Schema that includes the mention spec alongside all default inline content.
const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionSpec,
    nodeMention: NodeMentionSpec,
  },
});

type TableCommand = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean;

const subscribeToClientMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// ---------------------------------------------------------------------------
// PostEditor component
// ---------------------------------------------------------------------------

export interface PostEditorProps {
  initialContent?: PartialBlock[];
  editable?: boolean;
  /** Actors available for @mention suggestions (edit mode only). */
  actors?: ActorForMention[];
  onChange?: (blocks: Block[]) => void;
  onSubmit?: (blocks: Block[]) => void;
  onCancel?: () => void;
}

export function PostEditor({
  initialContent,
  editable = true,
  actors,
  onChange,
  onSubmit,
  onCancel,
}: PostEditorProps) {
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot
  );

  if (!mounted) {
    return (
      <div
        className="bn-post-editor min-h-[2.5rem]"
        aria-hidden="true"
      />
    );
  }

  return (
    <PostEditorInner
      initialContent={initialContent}
      editable={editable}
      actors={actors}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

function PostEditorInner({
  initialContent,
  editable = true,
  actors,
  onChange,
  onSubmit,
  onCancel,
}: PostEditorProps) {
  const { resolvedTheme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [liveActors, setLiveActors] = useState<ActorForMention[] | null>(null);
  const mentionActors = useMemo(
    () => mergeActorsForMention(actors ?? [], liveActors ?? []),
    [actors, liveActors]
  );

  const editor = useCreateBlockNote({
    schema,
    initialContent,
    tables: {
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
    },
    uploadFile: editable ? uploadImage : undefined,
  });

  // VIEWER-mode live update. `useCreateBlockNote` only honours `initialContent`
  // on first mount; subsequent prop changes are ignored. That's correct for
  // the editing case (the user owns the document and we don't want their
  // typing wiped out by a re-render), but breaks the 1.11 streaming-agent
  // case: the post body keeps updating from DB polling and the viewer would
  // freeze on the first chunk forever. So when we're in viewer mode and
  // `initialContent` actually changed, we replace the editor's blocks. We
  // serialise both sides before swapping to avoid pointless work on the
  // many polls where the body is unchanged.
  useEffect(() => {
    if (editable || !initialContent) return;
    const incoming = JSON.stringify(initialContent);
    const current = JSON.stringify(editor.document);
    if (incoming === current) return;
    editor.replaceBlocks(editor.document, initialContent);
  }, [initialContent, editor, editable]);

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;

    fetch("/api/actors", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { actors?: ActorForMention[] } | null) => {
        if (!cancelled && Array.isArray(payload?.actors)) {
          setLiveActors(payload.actors);
        }
      })
      .catch(() => {
        // Initial server actors are still usable if the refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [editable]);

  // Cmd/Ctrl+Enter → submit; Escape → cancel. Uses capture phase so we beat
  // ProseMirror's own keymap handlers.
  useEffect(() => {
    if (!editable) return;
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSubmit?.(editor.document as Block[]);
      }
      if (e.key === "Escape") onCancel?.();
    };
    el.addEventListener("keydown", handler, true);
    return () => el.removeEventListener("keydown", handler, true);
  }, [editable, editor, onSubmit, onCancel]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handler = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selectionIsInside(el, selection)) {
        return;
      }

      const editorSelectionSource = editable
        ? clipboardSourceFromEditorSelection(editor)
        : null;
      const domSelectionSource = clipboardSourceFromDomSelection(selection);
      const source = editorSelectionSource ?? domSelectionSource;
      if (!source) return;

      const payload = buildPostClipboardPayload(source);
      if (!payload.html && !payload.text) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      event.clipboardData.clearData();
      event.clipboardData.setData("text/plain", payload.text);
      event.clipboardData.setData("text/html", payload.html);
      if (payload.blockNoteHtml) {
        event.clipboardData.setData("blocknote/html", payload.blockNoteHtml);
      }

      if (
        event.type === "cut" &&
        editable &&
        editorSelectionSource &&
        !editor.prosemirrorState.selection.empty
      ) {
        editor.prosemirrorView.dispatch(
          editor.prosemirrorState.tr.deleteSelection()
        );
      }
    };

    document.addEventListener("copy", handler, true);
    document.addEventListener("cut", handler, true);
    return () => {
      document.removeEventListener("copy", handler, true);
      document.removeEventListener("cut", handler, true);
    };
  }, [editable, editor]);

  return (
    <div ref={wrapperRef} className="bn-post-editor">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        editable={editable}
        sideMenu={false}
        onChange={() => onChange?.(editor.document as Block[])}
      >
        {editable && <SideMenuController sideMenu={PostEditorSideMenu} />}
        {/* @mention suggestion menu — only in edit mode with actors available */}
        {editable && mentionActors.length > 0 && (
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const q = query.toLowerCase();
              return mentionActors
                .filter((a) => a.name.toLowerCase().includes(q))
                .map((a) => ({
                  title: a.name,
                  subtext: a.kind === "agent" ? "Agent" : "Human",
                  icon: <ActorInitialIcon actor={a} />,
                  group: a.kind === "agent" ? "Agents" : "People",
                  onItemClick: () => {
                    editor.insertInlineContent([
                      {
                        type: "mention",
                        props: { id: a.id, name: a.name, kind: a.kind },
                      },
                      " ", // space after mention so cursor moves past it
                    ]);
                  },
                }));
            }}
          />
        )}
        {editable && (
          <SuggestionMenuController
            triggerCharacter="#"
            getItems={async (query) => {
              const nodes = await fetchNodeMentionCandidates(query);
              return nodes.map((node) => ({
                title: node.title,
                subtext: node.path,
                icon: <NodeMentionIcon type={node.type} />,
                group: "Nodes",
                onItemClick: () => {
                  editor.insertInlineContent([
                    {
                      type: "nodeMention",
                      props: {
                        id: node.id,
                        title: node.title,
                        type: node.type,
                        path: node.path,
                      },
                    },
                    " ",
                  ]);
                },
              }));
            }}
          />
        )}
      </BlockNoteView>
    </div>
  );
}

function PostEditorSideMenu() {
  return <SideMenu dragHandleMenu={PostEditorDragHandleMenu} />;
}

function mergeActorsForMention(
  initialActors: ActorForMention[],
  liveActors: ActorForMention[]
): ActorForMention[] {
  const byId = new Map<string, ActorForMention>();

  for (const actor of initialActors) byId.set(actor.id, actor);
  for (const actor of liveActors) byId.set(actor.id, actor);

  const merged = Array.from(byId.values());
  const humans = merged.filter((actor) => actor.kind === "human");
  const agents = merged.filter((actor) => actor.kind === "agent");

  return [...humans, ...agents];
}

function PostEditorDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <TableCommandMenuItem command={deleteRow}>Delete row</TableCommandMenuItem>
      <TableCommandMenuItem command={deleteColumn}>
        Delete column
      </TableCommandMenuItem>
      <TableCommandMenuItem command={addRowBefore}>Row above</TableCommandMenuItem>
      <TableCommandMenuItem command={addRowAfter}>Row below</TableCommandMenuItem>
      <TableCommandMenuItem command={addColumnBefore}>
        Column left
      </TableCommandMenuItem>
      <TableCommandMenuItem command={addColumnAfter}>
        Column right
      </TableCommandMenuItem>
      <BlockColorsItem>Colors</BlockColorsItem>
      <TableRowHeaderItem>Header row</TableRowHeaderItem>
      <TableColumnHeaderItem>Header column</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}

function TableCommandMenuItem({
  children,
  command,
}: {
  children: ReactNode;
  command: TableCommand;
}) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const blockType = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block.type,
  });

  if (!Components || blockType !== "table") return null;

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        command(editor.prosemirrorState, editor.prosemirrorView.dispatch);
        editor.focus();
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

function clipboardSourceFromEditorSelection<
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema,
>(
  editor: BlockNoteEditor<BSchema, ISchema, SSchema>
): { html: string; blockNoteHtml?: string } | null {
  const view = editor.prosemirrorView;
  if (!view || view.state.selection.empty) return null;

  try {
    const { clipboardHTML, externalHTML } = selectedFragmentToHTML(view, editor);
    return { html: externalHTML, blockNoteHtml: clipboardHTML };
  } catch {
    return null;
  }
}

function clipboardSourceFromDomSelection(
  selection: Selection
): { html: string } | null {
  if (selection.rangeCount === 0) return null;

  const container = document.createElement("div");
  for (let index = 0; index < selection.rangeCount; index++) {
    container.append(selection.getRangeAt(index).cloneContents());
  }

  const html = container.innerHTML.trim();
  if (html) return { html };

  const text = selection.toString().trim();
  if (!text) return null;

  const textContainer = document.createElement("div");
  textContainer.textContent = text;
  return { html: textContainer.innerHTML };
}

function selectionIsInside(root: HTMLElement, selection: Selection): boolean {
  const { anchorNode, focusNode } = selection;
  return Boolean(
    anchorNode &&
      focusNode &&
      root.contains(anchorNode) &&
      root.contains(focusNode)
  );
}

// ---------------------------------------------------------------------------
// Small avatar shown inside the @mention suggestion menu
// ---------------------------------------------------------------------------

function ActorInitialIcon({ actor }: { actor: ActorForMention }) {
  const initials = actor.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      style={{
        display: "inline-flex",
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: actor.kind === "agent" ? "rgba(124,58,237,0.15)" : "var(--bg-hover)",
        fontSize: 9,
        fontWeight: 700,
        color: actor.kind === "agent" ? "#7C3AED" : "var(--text-secondary)",
        outline: actor.kind === "agent" ? "2px solid rgba(124,58,237,0.4)" : "none",
        outlineOffset: 1,
      }}
    >
      {initials}
    </span>
  );
}

async function fetchNodeMentionCandidates(
  query: string
): Promise<NodeMentionCandidate[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());

  try {
    const res = await fetch(`/api/nodes/mentions?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { nodes?: NodeMentionCandidate[] };
    return Array.isArray(payload.nodes) ? payload.nodes : [];
  } catch {
    return [];
  }
}

function NodeMentionIcon({ type }: { type: NodeMentionCandidate["type"] }) {
  const label = type === "workspace" ? "W" : type === "stack" ? "S" : "C";

  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-accent/10 text-[9px] font-bold text-accent">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Image upload (called by BlockNote when user inserts an image block)
// ---------------------------------------------------------------------------

async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error ?? "Upload failed");
  }
  const { url } = await res.json();
  return url as string;
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

export function parsePostBody(body: string | null): PartialBlock[] | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return parsed as PartialBlock[];
    }
  } catch {
    // Not valid JSON — legacy plain text below.
  }
  const lines = body.split("\n").filter(Boolean);
  if (lines.length === 0) return undefined;
  return lines.map((line) => ({ type: "paragraph" as const, content: line }));
}

export function serializePostBody(blocks: Block[]): string {
  return JSON.stringify(blocks);
}
