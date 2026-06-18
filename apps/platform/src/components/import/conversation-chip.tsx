"use client";

import type { DragEvent } from "react";
import type { ReviewConversation } from "@/lib/import-cluster-review";
import { conversationChipLabel } from "@/lib/import-cluster-review";

export interface ConversationChipProps {
  conversation: ReviewConversation;
  selected: boolean;
  onSelect: (conversationId: string) => void;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
}

export function ConversationChip({
  conversation,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: ConversationChipProps) {
  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", conversation.id);
    onDragStart(conversation.id);
  }

  return (
    <span className="group relative inline-flex max-w-full align-top">
      <button
        type="button"
        draggable
        onClick={() => onSelect(conversation.id)}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        className={[
          "max-w-full truncate rounded-sm border px-2 py-1 text-left text-xs font-medium transition-colors",
          selected
            ? "border-accent bg-accent-subtle text-text-primary"
            : "border-border bg-bg-card text-text-primary hover:border-border-strong hover:bg-bg-hover",
        ].join(" ")}
      >
        {conversationChipLabel(conversation)}
      </button>
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-md border border-border bg-bg-card p-3 text-xs shadow-lg group-hover:block">
        <span className="block font-medium text-text-primary">
          {conversation.title}
        </span>
        <span className="mt-1 block text-text-tertiary">
          {conversation.messageCount} msgs · {conversation.confidence} ·{" "}
          {conversation.updatedLabel}
        </span>
        <span className="mt-2 line-clamp-4 block text-text-secondary">
          {conversation.summary}
        </span>
      </span>
    </span>
  );
}
