"use client";

import { useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import {
  applyInstruction,
  applyQuestionToggle,
  createClusterFromConversation,
  createInitialClusterReviewState,
  moveConversation,
  type HoldingAreaId,
  type ImportClusterReviewState,
  type ReviewCluster,
  type ReviewConversation,
  type ReviewLocation,
} from "@/lib/import-cluster-review";
import { ClusterReviewQuestion } from "./cluster-review-question";
import { ConversationChip } from "./conversation-chip";
import { ConversationDetailPanel } from "./conversation-detail-panel";

const HOLDING_LABELS: Record<HoldingAreaId, string> = {
  ambiguous: "Ambiguous",
  oneOffs: "One-Offs",
  excluded: "Excluded",
};

export function ClusterReviewSurface() {
  const [reviewState, setReviewState] = useState(() =>
    createInitialClusterReviewState()
  );
  const [history, setHistory] = useState<ImportClusterReviewState[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState(
    "conv-workos-investigation"
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");

  const conversationById = useMemo(
    () =>
      new Map(
        reviewState.conversations.map((conversation) => [
          conversation.id,
          conversation,
        ])
      ),
    [reviewState.conversations]
  );

  const selectedConversation =
    conversationById.get(selectedConversationId) ?? null;

  const clusteredCount = reviewState.clusters.reduce(
    (count, cluster) => count + cluster.conversationIds.length,
    0
  );
  const ambiguousCount = reviewState.holdingAreas.ambiguous.length;
  const oneOffCount = reviewState.holdingAreas.oneOffs.length;
  const excludedCount = reviewState.holdingAreas.excluded.length;

  function commit(updater: (current: ImportClusterReviewState) => ImportClusterReviewState) {
    setReviewState((current) => {
      setHistory((past) => [...past, current]);
      return updater(current);
    });
  }

  function handleMove(conversationId: string, target: ReviewLocation) {
    commit((current) => moveConversation(current, conversationId, target));
    setSelectedConversationId(conversationId);
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    target: ReviewLocation | "newCluster"
  ) {
    event.preventDefault();
    const conversationId =
      event.dataTransfer.getData("text/plain") || draggingId;
    if (!conversationId) return;

    if (target === "newCluster") {
      const title = window.prompt("New cluster name");
      if (!title?.trim()) return;
      commit((current) =>
        createClusterFromConversation(current, conversationId, title.trim())
      );
      setSelectedConversationId(conversationId);
      return;
    }

    handleMove(conversationId, target);
  }

  function handleInstructionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed) return;
    commit((current) => applyInstruction(current, trimmed));
    setInstruction("");
  }

  function undo() {
    setHistory((past) => {
      const previous = past[past.length - 1];
      if (previous) setReviewState(previous);
      return past.slice(0, -1);
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary text-text-primary">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Import Review</div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Claude export cluster review
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {reviewState.conversations.length} chats · {clusteredCount}{" "}
              clustered · {ambiguousCount} ambiguous · {oneOffCount} one-offs ·{" "}
              {excludedCount} excluded
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Undo
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent-hover"
            >
              <Sparkles className="h-4 w-4" />
              Generate Starter Context
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="min-w-0 pb-28">
          <article className="overflow-hidden rounded-md border border-border bg-bg-card">
            <section className="border-b border-border">
              <div className="px-4 py-3">
                <div className="section-label">Suggested Adjustments</div>
                <h2 className="mt-1 text-base font-semibold">
                  Review the clustering questions
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  All suggestions start at No. Leaving them alone keeps the
                  current proposal.
                </p>
              </div>
              <div>
                {reviewState.questions.map((question) => (
                  <ClusterReviewQuestion
                    key={question.id}
                    question={question}
                    onToggle={(questionId, enabled) =>
                      commit((current) =>
                        applyQuestionToggle(current, questionId, enabled)
                      )
                    }
                  />
                ))}
              </div>
            </section>

            <section className="px-4 py-4">
              <div className="section-label">Cluster Proposal</div>
              <h2 className="mt-1 text-base font-semibold">
                Proposed import structure
              </h2>
            </section>

            {reviewState.clusters.map((cluster) => (
              <ClusterSection
                key={cluster.id}
                cluster={cluster}
                conversations={cluster.conversationIds.flatMap((id) => {
                  const conversation = conversationById.get(id);
                  return conversation ? [conversation] : [];
                })}
                selectedConversationId={selectedConversationId}
                draggingId={draggingId}
                onSelect={setSelectedConversationId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onDrop={(event) =>
                  handleDrop(event, { type: "cluster", id: cluster.id })
                }
              />
            ))}

            <section className="border-t border-border px-4 py-4">
              <div className="section-label">Holding Areas</div>
              <h2 className="mt-1 text-base font-semibold">
                Ambiguous, one-off, and excluded chats
              </h2>
            </section>

            {(
              Object.keys(HOLDING_LABELS) as HoldingAreaId[]
            ).map((holdingId) => (
              <HoldingSection
                key={holdingId}
                id={holdingId}
                title={HOLDING_LABELS[holdingId]}
                conversations={reviewState.holdingAreas[holdingId].flatMap(
                  (conversationId) => {
                    const conversation = conversationById.get(conversationId);
                    return conversation ? [conversation] : [];
                  }
                )}
                selectedConversationId={selectedConversationId}
                draggingId={draggingId}
                onSelect={setSelectedConversationId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onDrop={(event) =>
                  handleDrop(event, { type: "holding", id: holdingId })
                }
              />
            ))}

            <section
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, "newCluster")}
              className={[
                "border-t border-dashed border-border px-4 py-5 transition-colors",
                draggingId ? "bg-accent-subtle" : "bg-bg-primary",
              ].join(" ")}
            >
              <div className="section-label">New Cluster</div>
              <p className="mt-1 text-sm text-text-secondary">
                Drop a chat here to create a new cluster.
              </p>
            </section>
          </article>

          {reviewState.lastInstructionResult ? (
            <div className="mt-3 rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-secondary">
              {reviewState.lastInstructionResult.message}
            </div>
          ) : null}

          <form
            onSubmit={handleInstructionSubmit}
            className="sticky bottom-0 mt-4 rounded-md border border-border bg-bg-card p-3 shadow-sm"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder="Tell WorkOS how to adjust the clusters..."
                className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!instruction.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-bg-primary transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Apply instruction"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>

        <div className="min-w-0">
          <ConversationDetailPanel
            conversation={selectedConversation}
            clusters={reviewState.clusters}
            onMove={handleMove}
          />
        </div>
      </div>
    </main>
  );
}

interface ClusterSectionProps {
  cluster: ReviewCluster;
  conversations: ReviewConversation[];
  selectedConversationId: string;
  draggingId: string | null;
  onSelect: (conversationId: string) => void;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

function ClusterSection({
  cluster,
  conversations,
  selectedConversationId,
  draggingId,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
}: ClusterSectionProps) {
  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={[
        "border-t border-border px-4 py-4 transition-colors",
        draggingId ? "bg-accent-subtle/60" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {cluster.title}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {cluster.rationale}
          </p>
        </div>
        <span className="text-xs text-text-tertiary">
          {cluster.confidence} · {conversations.length} chats
        </span>
      </div>
      <ChipList
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </section>
  );
}

interface HoldingSectionProps {
  id: HoldingAreaId;
  title: string;
  conversations: ReviewConversation[];
  selectedConversationId: string;
  draggingId: string | null;
  onSelect: (conversationId: string) => void;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

function HoldingSection({
  id,
  title,
  conversations,
  selectedConversationId,
  draggingId,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
}: HoldingSectionProps) {
  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={[
        "border-t border-border px-4 py-4 transition-colors",
        draggingId ? "bg-accent-subtle/60" : "",
        id === "excluded" ? "opacity-80" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="text-xs text-text-tertiary">
          {conversations.length} chats
        </span>
      </div>
      <ChipList
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </section>
  );
}

interface ChipListProps {
  conversations: ReviewConversation[];
  selectedConversationId: string;
  onSelect: (conversationId: string) => void;
  onDragStart: (conversationId: string) => void;
  onDragEnd: () => void;
}

function ChipList({
  conversations,
  selectedConversationId,
  onSelect,
  onDragStart,
  onDragEnd,
}: ChipListProps) {
  if (conversations.length === 0) {
    return (
      <p className="mt-3 text-sm text-text-tertiary">
        Drop chats here to add them.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {conversations.map((conversation) => (
        <ConversationChip
          key={conversation.id}
          conversation={conversation}
          selected={conversation.id === selectedConversationId}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}
