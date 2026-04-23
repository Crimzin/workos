"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FieldCreateDialog } from "./field-create-dialog";

interface AddFieldButtonProps {
  workspaceId: string;
}

export function AddFieldButton({ workspaceId }: AddFieldButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
      >
        <Plus size={12} />
        <span>Add field</span>
      </button>
      <FieldCreateDialog
        workspaceId={workspaceId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
