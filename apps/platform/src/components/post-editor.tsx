"use client";

import "@blocknote/mantine/style.css";
import { useEffect, useRef } from "react";
import { useCreateBlockNote, createReactInlineContentSpec, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import type { Block, PartialBlock } from "@blocknote/core";
import type { ActorForMention } from "@/lib/actor";
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

// Schema that includes the mention spec alongside all default inline content.
const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionSpec,
  },
});

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
  const { resolvedTheme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useCreateBlockNote({
    schema,
    initialContent,
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

  return (
    <div ref={wrapperRef} className="bn-post-editor">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        editable={editable}
        onChange={() => onChange?.(editor.document as Block[])}
      >
        {/* @mention suggestion menu — only in edit mode with actors available */}
        {editable && actors && actors.length > 0 && (
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const q = query.toLowerCase();
              return actors
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
      </BlockNoteView>
    </div>
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
