"use client";

import { useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { createFocusReply } from "@/lib/actions/focus";

interface FocusComposerProps {
  sessionId: string;
}

export function FocusComposer({ sessionId }: FocusComposerProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disabled = pending || value.trim().length === 0;

  const submit = () => {
    const body = value.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      try {
        await createFocusReply(sessionId, body);
        setValue("");
      } catch {
        setError("Could not save that reply. Try again.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card p-2">
      <label className="sr-only" htmlFor="focus-reply">
        Reply to Focus
      </label>
      <textarea
        id="focus-reply"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Reply to Focus..."
        rows={3}
        className="block w-full resize-none bg-transparent px-2 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <span className="text-[11px] text-red-500">{error}</span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Send reply"
        >
          <ArrowUp size={15} />
        </button>
      </div>
    </div>
  );
}
