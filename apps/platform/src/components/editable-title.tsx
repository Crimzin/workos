"use client";

import { useRef, useState, useTransition } from "react";
import { updateNodeTitle } from "@/lib/actions/nodes";

interface EditableTitleProps {
  nodeId: string;
  workspaceId: string;
  parentId: string | null;
  initialTitle: string;
}

export function EditableTitle({
  nodeId,
  workspaceId,
  parentId,
  initialTitle,
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(initialTitle);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (trimmed !== initialTitle) {
      startTransition(() => {
        updateNodeTitle(nodeId, trimmed, workspaceId, parentId);
      });
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setValue(initialTitle); setEditing(false); }
        }}
        className="w-full rounded px-0.5 text-lg font-semibold tracking-tight text-text-primary outline-none ring-1 ring-accent focus:ring-2 bg-transparent"
      />
    );
  }

  return (
    <h2
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setEditing(true); }}
      title="Click to rename"
      className="cursor-text text-lg font-semibold tracking-tight text-text-primary hover:text-accent transition-colors"
    >
      {value}
    </h2>
  );
}
