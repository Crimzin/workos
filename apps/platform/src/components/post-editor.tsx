"use client";

import "@blocknote/mantine/style.css";
import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block, PartialBlock } from "@blocknote/core";
import { useTheme } from "./theme-provider";

// ---------------------------------------------------------------------------
// PostEditor
// ---------------------------------------------------------------------------

interface PostEditorProps {
  /** Pre-populated blocks for editing or viewing existing content. */
  initialContent?: PartialBlock[];
  /** False = read-only viewer; true (default) = full editor. */
  editable?: boolean;
  /**
   * Fired on every content change so the parent can track current blocks
   * (e.g. for a "Post" button outside the editor).
   */
  onChange?: (blocks: Block[]) => void;
  /**
   * Called when the user submits (Cmd/Ctrl+Enter).
   * Not wired in editable=false mode.
   */
  onSubmit?: (blocks: Block[]) => void;
  /** Called on Escape in edit mode. */
  onCancel?: () => void;
}

export function PostEditor({
  initialContent,
  editable = true,
  onChange,
  onSubmit,
  onCancel,
}: PostEditorProps) {
  const { resolvedTheme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useCreateBlockNote({
    initialContent,
    // Only active when editable — view-only instances skip the callback.
    uploadFile: editable ? uploadImage : undefined,
  });

  // Intercept Cmd/Ctrl+Enter and Escape in the capture phase so we get them
  // before ProseMirror's own keymap handlers.
  useEffect(() => {
    if (!editable) return;
    const el = wrapperRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSubmit?.(editor.document);
      }
      if (e.key === "Escape") {
        onCancel?.();
      }
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
        onChange={() => onChange?.(editor.document)}
      />
    </div>
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

/**
 * Parse a stored post body into BlockNote blocks.
 * Handles both:
 *  - New format: JSON array of BlockNote blocks
 *  - Legacy format: plain text (wraps each line in a paragraph block)
 */
export function parsePostBody(body: string | null): PartialBlock[] | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return parsed as PartialBlock[];
    }
  } catch {
    // Not valid JSON — treat as legacy plain text below.
  }
  // Legacy plain text: split by newlines, each line → paragraph block.
  const lines = body.split("\n").filter(Boolean);
  if (lines.length === 0) return undefined;
  return lines.map((line) => ({ type: "paragraph" as const, content: line }));
}

/**
 * Serialize BlockNote blocks to a JSON string for storage.
 */
export function serializePostBody(blocks: Block[]): string {
  return JSON.stringify(blocks);
}
