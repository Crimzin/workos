"use client";

import { MoveRight } from "lucide-react";
import type {
  HoldingAreaId,
  ReviewCluster,
  ReviewConversation,
  ReviewLocation,
} from "@/lib/import-cluster-review";

export interface ConversationDetailPanelProps {
  conversation: ReviewConversation | null;
  clusters: ReviewCluster[];
  onMove: (conversationId: string, target: ReviewLocation) => void;
}

const HOLDING_OPTIONS: Array<{ id: HoldingAreaId; label: string }> = [
  { id: "ambiguous", label: "Ambiguous" },
  { id: "oneOffs", label: "One-Offs" },
  { id: "excluded", label: "Excluded" },
];

export function ConversationDetailPanel({
  conversation,
  clusters,
  onMove,
}: ConversationDetailPanelProps) {
  if (!conversation) {
    return (
      <aside className="rounded-md border border-border bg-bg-card p-4 text-sm text-text-secondary">
        Select a chat chip to inspect the evidence behind its placement.
      </aside>
    );
  }

  function handleMove(value: string) {
    if (!conversation || !value) return;
    const [type, id] = value.split(":");
    if (type === "cluster") {
      onMove(conversation.id, { type: "cluster", id });
    }
    if (type === "holding") {
      onMove(conversation.id, { type: "holding", id: id as HoldingAreaId });
    }
  }

  return (
    <aside className="rounded-md border border-border bg-bg-card">
      <div className="border-b border-border p-4">
        <div className="section-label">Chat Detail</div>
        <h2 className="mt-1 text-sm font-semibold text-text-primary">
          {conversation.title}
        </h2>
        <p className="mt-1 text-xs text-text-tertiary">
          {conversation.messageCount} messages · {conversation.confidence} ·{" "}
          {conversation.updatedLabel}
        </p>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <DetailBlock label="Why Included" text={conversation.rationale} />
        <DetailBlock label="Summary" text={conversation.summary} />
        <DetailBlock label="First Human Turn" text={conversation.firstHuman} />
        <DetailBlock label="Last Human Turn" text={conversation.lastHuman} />

        {conversation.highSignalTurns.length > 0 ? (
          <div>
            <div className="section-label">High-Signal Turns</div>
            <ul className="mt-2 space-y-2 text-xs text-text-secondary">
              {conversation.highSignalTurns.map((turn) => (
                <li key={turn} className="border-l border-border pl-3">
                  {turn}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {conversation.rareTerms.length > 0 ? (
          <div>
            <div className="section-label">Rare Terms</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conversation.rareTerms.map((term) => (
                <span
                  key={term}
                  className="rounded-sm bg-bg-secondary px-1.5 py-0.5 text-xs text-text-secondary"
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="section-label flex items-center gap-1">
            Move To <MoveRight className="h-3 w-3" />
          </span>
          <select
            className="mt-2 w-full rounded-md border border-border bg-bg-primary px-2 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
            defaultValue=""
            onChange={(event) => {
              handleMove(event.target.value);
              event.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              Choose destination
            </option>
            {clusters.map((cluster) => (
              <option key={cluster.id} value={`cluster:${cluster.id}`}>
                {cluster.title}
              </option>
            ))}
            {HOLDING_OPTIONS.map((option) => (
              <option key={option.id} value={`holding:${option.id}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

interface DetailBlockProps {
  label: string;
  text: string;
}

function DetailBlock({ label, text }: DetailBlockProps) {
  if (!text) return null;
  return (
    <div>
      <div className="section-label">{label}</div>
      <p className="mt-1 text-sm text-text-secondary">{text}</p>
    </div>
  );
}
