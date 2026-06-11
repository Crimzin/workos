"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, GripHorizontal, Pin } from "lucide-react";
import type { Block } from "@blocknote/core";
import type { ActorForMention } from "@/lib/actor";
import type { PostRecord } from "@/lib/posts";
import { createPost, pollNodePosts } from "@/lib/actions/posts";
import { findAgentMentions } from "@/lib/agents/mention-detection";
import {
  AGENT_MODEL_GROUPS,
  providerKeyForResponderName,
  resolveDefaultModelFromConfig,
  type AgentModelSelection,
} from "@/lib/agents/model-selection";
import { buildRequestedAgentMentions } from "@/lib/agents/response-selection";
import {
  COMPOSER_COMPACT_HEIGHT,
  clampComposerHeight,
  getNextComposerCompactState,
} from "@/lib/composer-resize";
import { orderPostsForThread } from "@/lib/post-order";
import type { AgentProviderSetting } from "@/lib/types";
import { PostEditor, serializePostBody } from "./post-editor";
import { PostItem } from "./post-item";

/**
 * How long to wait for a Claude reply before hiding the thinking indicator.
 * 4 minutes accommodates the worst-case agent path (broad context + long
 * response). With streaming the indicator is normally replaced by the
 * actual reply within ~3s, so this is purely a safety net.
 */
const CLAUDE_THINKING_TIMEOUT_MS = 240_000;
/**
 * Cadence for polling the server while a Claude reply is streaming. Faster
 * polling makes the streamed text appear closer to real-time. 750ms +
 * 400ms server-side flush = ~1.2s perceived latency per chunk, which feels
 * like live typing in practice.
 */
const CLAUDE_POLL_INTERVAL_MS = 750;
/**
 * Initial polling window after the user submits an @Claude post. Polling
 * runs at least this long even with zero activity — handles the case where
 * Claude's first chunk takes 30–60s to arrive on large-context payloads.
 */
const POLL_INITIAL_DURATION_MS = 90_000;
/**
 * Polling stays alive at least this long after the LAST observed Claude
 * post body growth. Streams typically finish + final flush within this
 * window, so the user sees the complete reply without manually refreshing.
 */
const POLL_IDLE_EXTENSION_MS = 15_000;
const COMPOSER_REVEAL_GRACE_MS = 250;

interface ThinkingClaude {
  id: string;
  name: string;
  /**
   * Post IDs that already existed when the user submitted. The indicator
   * clears as soon as we see a post by this Claude actor that ISN'T in this
   * set — i.e. a brand-new reply that landed after the @-mention. We use
   * post-id presence rather than `created_at > startedAt` because client and
   * DB clocks drift, which made timestamp comparisons unreliable (the
   * indicator stuck even after the reply arrived).
   */
  knownPostIds: Set<string>;
}

interface PostsTabContentProps {
  nodeId: string;
  workspaceId: string;
  initialPosts: PostRecord[];
  currentActorId: string;
  currentActorName: string;
  actors: ActorForMention[];
  inlineClaudeEnabled: boolean;
  agentProviders: AgentProviderSetting[];
}

/** True when the document has only a single empty paragraph (nothing typed). */
function isEditorEmpty(blocks: Block[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const b = blocks[0];
  return (
    b.type === "paragraph" &&
    (!b.content || (Array.isArray(b.content) && b.content.length === 0))
  );
}

export function PostsTabContent({
  nodeId,
  workspaceId,
  initialPosts,
  currentActorId,
  actors,
  inlineClaudeEnabled,
  agentProviders,
}: PostsTabContentProps) {
  const [posts, setPosts] = useState<PostRecord[]>(initialPosts);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const [composerCompact, setComposerCompact] = useState(false);
  // Increment to force-remount (reset) the BlockNote composer after submit.
  const [composerKey, setComposerKey] = useState(0);
  // Claude actors we're waiting on. Empty means no thinking indicator shown.
  const [thinkingClaudes, setThinkingClaudes] = useState<ThinkingClaude[]>([]);
  // Toggles the polling loop on. We keep this independent of the indicator
  // state because the indicator hides as soon as Claude's first chunk lands,
  // but we still need to keep polling so subsequent stream flushes update
  // the rendered post body.
  const [isPolling, setIsPolling] = useState(false);
  // Wall-clock deadline beyond which the poll loop stops. Stored in a ref
  // (not state) so updating it doesn't restart the polling effect, which
  // would clear/recreate the interval on every observed chunk.
  const pollDeadlineRef = useRef<number>(0);
  const currentBlocksRef = useRef<Block[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const composerEditorRef = useRef<HTMLDivElement>(null);
  const composerResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const composerRevealUntilRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const router = useRouter();
  const agentActors = useMemo(
    () => actors.filter((actor) => actor.kind === "agent"),
    [actors]
  );
  const workosBackingAgent =
    agentActors.find((actor) => actor.name.toLowerCase() === "workos") ??
    agentActors.find((actor) => actor.name.toLowerCase().startsWith("claude")) ??
    agentActors[0] ??
    null;
  const responderOptions = [
    ...(workosBackingAgent
      ? [
          {
            id: "workos",
            label: "WorkOS",
            agent: workosBackingAgent,
            providerKey: providerKeyForResponderName(workosBackingAgent.name),
          },
        ]
      : []),
    ...agentActors.map((agent) => ({
      id: agent.id,
      label: agent.name,
      agent,
      providerKey: providerKeyForResponderName(agent.name),
    })),
  ];
  const [selectedResponderId, setSelectedResponderId] = useState(
    responderOptions[0]?.id ?? ""
  );
  const selectedResponder =
    responderOptions.find((option) => option.id === selectedResponderId) ??
    responderOptions[0] ??
    null;
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(
    null
  );
  const selectedAgent = selectedResponder?.agent ?? null;
  const selectedResponderLabel = selectedResponder?.label ?? selectedAgent?.name;
  const selectedProviderSettings = selectedResponder
    ? agentProviders.find(
        (provider) => provider.provider_key === selectedResponder.providerKey
      )
    : null;
  const selectedDefaultModel = selectedResponder
    ? resolveDefaultModelFromConfig(
        selectedResponder.providerKey,
        selectedProviderSettings?.config
      )
    : null;
  const selectedModel =
    selectedResponder && modelSelection?.providerKey === selectedResponder.providerKey
      ? modelSelection
      : selectedDefaultModel;

  // Keep local posts in sync when server passes fresh data (after router.refresh()).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts(initialPosts);
  }, [initialPosts]);

  // 1.11 Inline AI streaming poll loop. Runs while `isPolling` is true.
  // Bypasses `router.refresh()` (which goes through unstable_cache and is
  // unreliable to invalidate from inside `after()` callbacks in Next 16 dev)
  // and hits Supabase directly via the `pollNodePosts` server action. The
  // result REPLACES local `posts` state immediately, so streamed body
  // updates appear within one poll interval.
  //
  // Lifecycle:
  //   - `pollDeadlineRef` is set to a wall-clock deadline when the user
  //     submits an @Claude post (or when activity extends it).
  //   - Each poll checks if Date.now() ≥ deadline; if so, sets isPolling to
  //     false and stops.
  //   - Each poll also detects activity (a Claude post body grew) and
  //     EXTENDS the deadline by POLL_IDLE_EXTENSION_MS so polling stays
  //     alive for the duration of the stream + a little buffer.
  //
  // The thinking indicator's visibility is controlled separately by the
  // auto-hide effect below — polling outlives the indicator on purpose so
  // chunks keep streaming after the first one lands.
  useEffect(() => {
    if (!isPolling) return;
    let cancelled = false;
    // Track per-post body lengths between polls so we can detect growth and
    // extend the deadline. Lives in the effect closure — wiped on restart.
    const lastSeenLengths = new Map<string, number>();

    const poll = async () => {
      if (Date.now() >= pollDeadlineRef.current) {
        cancelled = true;
        setIsPolling(false);
        return;
      }
      try {
        const fresh = await pollNodePosts(nodeId);
        if (cancelled) return;
        setPosts(fresh);

        // Did any agent post grow since the last poll? If so, extend the
        // deadline so the next chunk has time to land. We only count GROWTH
        // (not just presence), so the deadline doesn't extend forever on a
        // long-since-finished post.
        let grew = false;
        for (const p of fresh) {
          if (p.actor?.kind !== "agent" || p.post_type !== "post") continue;
          const len = p.body?.length ?? 0;
          const prev = lastSeenLengths.get(p.id) ?? 0;
          if (len > prev) grew = true;
          lastSeenLengths.set(p.id, len);
        }
        if (grew) {
          pollDeadlineRef.current = Math.max(
            pollDeadlineRef.current,
            Date.now() + POLL_IDLE_EXTENSION_MS
          );
        }
      } catch {
        /* swallow — next tick will retry */
      }
    };

    // Kick off an immediate poll so the first streamed text arrives without
    // waiting a full interval.
    poll();
    const interval = setInterval(poll, CLAUDE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isPolling, nodeId]);

  // Safety timeout for the THINKING INDICATOR ONLY. If Claude never replies
  // (network failure, etc.) we hide the indicator after the full timeout.
  // Polling has its own deadline mechanism above and doesn't share this
  // timer.
  useEffect(() => {
    if (thinkingClaudes.length === 0) return;
    const safety = setTimeout(
      () => setThinkingClaudes([]),
      CLAUDE_THINKING_TIMEOUT_MS
    );
    return () => clearTimeout(safety);
  }, [thinkingClaudes]);

  const pinnedCount = posts.filter((p) => p.pinned).length;
  const visiblePosts = showPinnedOnly ? posts.filter((p) => p.pinned) : posts;
  const orderedVisiblePosts = useMemo(
    () => orderPostsForThread(visiblePosts),
    [visiblePosts]
  );
  // Hide the thinking indicator the moment Claude's reply post lands. We
  // detect a "new" reply as any post authored by one of the Claude actors
  // we're waiting on whose ID was NOT already known when we started waiting.
  // ID-based checks sidestep clock skew between client and DB timestamps.
  const activeThinkingClaudes = thinkingClaudes.filter(
    (c) =>
      !posts.some(
        (p) =>
          p.actor_id === c.id &&
          p.post_type === "post" &&
          !c.knownPostIds.has(p.id)
      )
  );
  const feedScrollKey = orderedVisiblePosts
    .map((p) => `${p.id}:${p.updated_at}:${p.body?.length ?? 0}`)
    .join("|");

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      feed.scrollTop = feed.scrollHeight;
    });
  }, [feedScrollKey, activeThinkingClaudes.length, showPinnedOnly]);

  const handleFeedScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    const distanceFromBottom =
      feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 48;
    setComposerCompact((currentlyCompact) => {
      if (Date.now() < composerRevealUntilRef.current) return false;
      return getNextComposerCompactState(
        currentlyCompact,
        distanceFromBottom,
        feed.clientHeight
      );
    });
  };

  const revealComposer = () => {
    composerRevealUntilRef.current = Date.now() + COMPOSER_REVEAL_GRACE_MS;
    setComposerCompact(false);
  };

  const handleComposerResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    revealComposer();
    event.currentTarget.setPointerCapture(event.pointerId);
    const measuredHeight =
      composerHeight ??
      composerEditorRef.current?.getBoundingClientRect().height ??
      COMPOSER_COMPACT_HEIGHT;
    composerResizeRef.current = {
      startY: event.clientY,
      startHeight: measuredHeight,
    };
  };

  const handleComposerResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = composerResizeRef.current;
    if (!resize) return;
    const nextHeight = clampComposerHeight(
      resize.startHeight - (event.clientY - resize.startY)
    );
    setComposerHeight(nextHeight);
  };

  const handleComposerResizeEnd = () => {
    composerResizeRef.current = null;
  };

  const handleSubmit = (
    blocks: Block[],
    options: { requestAgentResponse: boolean }
  ) => {
    if (isEditorEmpty(blocks)) return;
    const body = serializePostBody(blocks);
    const requestedAgents = buildRequestedAgentMentions({
      requestAgentResponse: options.requestAgentResponse,
      mentionedAgents: findAgentMentions(body),
      selectedAgent,
    });

    // 1.11 Inline AI: show the thinking indicator only for the actual inline
    // Claude provider. Claude Code is routed separately by the server and
    // disabled inline Claude should not create a false waiting state.
    const claudeMentions = inlineClaudeEnabled
      ? requestedAgents.filter((m) => {
          const name = m.name.toLowerCase();
          return name.startsWith("claude") && !name.includes("code");
        })
      : [];

    // Snapshot the post IDs visible right now — used by the auto-hide effect
    // to decide whether a freshly-arrived Claude post is the awaited reply.
    const knownPostIds = new Set(posts.map((p) => p.id));

    startTransition(async () => {
      await createPost(nodeId, workspaceId, body, {
        requestAgentResponse: options.requestAgentResponse,
        selectedAgent,
        modelSelection: selectedModel
          ? {
              providerKey: selectedModel.providerKey,
              modelId: selectedModel.modelId,
            }
          : null,
      });
      setComposerKey((k) => k + 1); // remounts editor → clean slate
      setHasContent(false);
      if (claudeMentions.length > 0) {
        setThinkingClaudes(
          claudeMentions.map((m) => ({ id: m.id, name: m.name, knownPostIds }))
        );
        // Start the streaming poll loop. The deadline is wall-clock; the
        // poll effect will extend it whenever it observes Claude post body
        // growth, so polling stays alive for the full duration of the
        // stream + a 15s buffer afterward.
        pollDeadlineRef.current = Date.now() + POLL_INITIAL_DURATION_MS;
        setIsPolling(true);
      }
      router.refresh();
    });
  };

  const handlePinToggle = (postId: string, pinned: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, pinned, pinned_at: pinned ? new Date().toISOString() : null }
          : p
      )
    );
    if (!pinned && pinnedCount - 1 === 0) setShowPinnedOnly(false);
  };

  const handleDelete = (postId: string) => {
    const deletedPost = posts.find((p) => p.id === postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    if (!deletedPost || deletedPost.post_type !== "post" || thinkingClaudes.length === 0) {
      return;
    }
    setThinkingClaudes((prev) =>
      prev.filter(
        (c) =>
          deletedPost.actor_id !== c.id || c.knownPostIds.has(deletedPost.id)
      )
    );
  };

  const handleUpdate = (postId: string, newBody: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, body: newBody } : p))
    );
  };

  const submitWithAiResponse = () => {
    handleSubmit(currentBlocksRef.current, { requestAgentResponse: true });
  };

  const submitWithoutAiResponse = () => {
    handleSubmit(currentBlocksRef.current, { requestAgentResponse: false });
  };

  const effectiveComposerHeight = composerCompact
    ? COMPOSER_COMPACT_HEIGHT
    : composerHeight;
  const composerEditorStyle = effectiveComposerHeight
    ? { height: effectiveComposerHeight }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pinned filter toggle */}
      {pinnedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowPinnedOnly((v) => !v)}
          className={[
            "flex w-full items-center gap-1.5 border-b border-border px-5 py-2 text-left text-xs transition-colors",
            showPinnedOnly
              ? "bg-accent/5 text-accent"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
          ].join(" ")}
        >
          <Pin size={11} className="shrink-0" />
          <span>
            {pinnedCount} pinned
            {showPinnedOnly && " · click to show all"}
          </span>
        </button>
      )}

      {/* Feed. Posts render oldest-to-newest so the newest post sits at the bottom.
          The "Claude is thinking…" indicator follows the current newest post. */}
      <div
        ref={feedRef}
        onScroll={handleFeedScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        {orderedVisiblePosts.length === 0 && activeThinkingClaudes.length === 0 && (
          <p className="py-10 text-center text-sm text-text-tertiary">
            {showPinnedOnly
              ? "No pinned posts."
              : "No posts yet. Be the first to post."}
          </p>
        )}

        {orderedVisiblePosts.length > 0 && (
          <div className="divide-y divide-border">
            {orderedVisiblePosts.map((post, idx) => (
              <Fragment key={post.id}>
                <PostItem
                  post={post}
                  nodeId={nodeId}
                  workspaceId={workspaceId}
                  currentActorId={currentActorId}
                  actors={actors}
                  onPinToggle={handlePinToggle}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
                {idx === orderedVisiblePosts.length - 1 &&
                  activeThinkingClaudes.length > 0 &&
                  !showPinnedOnly &&
                  activeThinkingClaudes.map((c) => (
                    <ClaudeThinkingIndicator key={c.id} name={c.name} />
                  ))}
              </Fragment>
            ))}
          </div>
        )}

        {/* Edge case: empty thread with an in-flight Claude reply. Shouldn't
            normally happen (the user's post is always inserted first) but we
            render the indicator anyway so the user gets feedback. */}
        {orderedVisiblePosts.length === 0 && activeThinkingClaudes.length > 0 && !showPinnedOnly && (
          <div className="divide-y divide-border">
            {activeThinkingClaudes.map((c) => (
              <ClaudeThinkingIndicator key={c.id} name={c.name} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className={[
          "shrink-0 border-t border-border px-4 py-3",
          pending ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <button
          type="button"
          aria-label="Resize composer"
          title="Drag to resize composer"
          className="mx-auto -mt-2 mb-1 flex h-4 w-12 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary cursor-ns-resize transition-colors"
          onPointerDown={handleComposerResizeStart}
          onPointerMove={handleComposerResizeMove}
          onPointerUp={handleComposerResizeEnd}
          onPointerCancel={handleComposerResizeEnd}
          onDoubleClick={() => setComposerHeight(null)}
        >
          <GripHorizontal size={15} />
        </button>
        <div
          ref={composerEditorRef}
          className="post-composer-editor rounded-xl border border-border bg-bg-card overflow-hidden focus-within:ring-1 focus-within:ring-accent"
          data-fixed-height={effectiveComposerHeight ? "true" : undefined}
          data-compact={composerCompact ? "true" : undefined}
          style={composerEditorStyle}
          onFocusCapture={revealComposer}
          onPointerDownCapture={revealComposer}
          onKeyDownCapture={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.shiftKey &&
              event.key === "Enter"
            ) {
              event.preventDefault();
              event.stopPropagation();
              submitWithoutAiResponse();
            }
          }}
        >
          <PostEditor
            key={composerKey}
            editable
            actors={actors}
            onChange={(blocks) => {
              currentBlocksRef.current = blocks;
              setHasContent(!isEditorEmpty(blocks));
            }}
            onSubmit={() => submitWithAiResponse()}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            / for blocks · ⌘↵ to send · ⇧⌘↵ without AI
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !hasContent}
              onClick={submitWithoutAiResponse}
              className="rounded px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary disabled:opacity-40"
            >
              Post without AI response
            </button>
            {agentActors.length > 0 && (
              <AgentModelMenu
                disabled={pending}
                responders={responderOptions}
                selectedResponderId={selectedResponder?.id ?? ""}
                selectedModel={selectedModel}
                onSelect={(responderId, model) => {
                  setSelectedResponderId(responderId);
                  setModelSelection(model);
                }}
              />
            )}
            <button
              type="button"
              disabled={pending || !hasContent}
              onClick={submitWithAiResponse}
              aria-label={
                selectedResponderLabel
                  ? `Send and ask ${selectedResponderLabel}`
                  : "Send"
              }
              title={
                selectedResponderLabel
                  ? `Send and ask ${selectedResponderLabel}`
                  : "Send"
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AgentResponderOption {
  id: string;
  label: string;
  agent: ActorForMention;
  providerKey: AgentModelSelection["providerKey"];
}

interface AgentModelMenuProps {
  responders: AgentResponderOption[];
  selectedResponderId: string;
  selectedModel: AgentModelSelection | null;
  disabled: boolean;
  onSelect: (responderId: string, model: AgentModelSelection) => void;
}

function AgentModelMenu({
  responders,
  selectedResponderId,
  selectedModel,
  disabled,
  onSelect,
}: AgentModelMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedResponder =
    responders.find((responder) => responder.id === selectedResponderId) ??
    responders[0] ??
    null;
  const [activeResponderId, setActiveResponderId] = useState(
    selectedResponder?.id ?? ""
  );
  const activeResponder =
    responders.find((responder) => responder.id === activeResponderId) ??
    selectedResponder ??
    responders[0] ??
    null;
  const activeModels = activeResponder
    ? AGENT_MODEL_GROUPS[activeResponder.providerKey]
    : [];
  const selectedLabel = [
    selectedResponder?.label,
    selectedModel?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={menuRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (selectedResponder) setActiveResponderId(selectedResponder.id);
          setOpen((value) => !value);
        }}
        onFocus={() => {
          if (selectedResponder) setActiveResponderId(selectedResponder.id);
        }}
        className="inline-flex h-7 min-w-[132px] items-center justify-between gap-1 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:border-border-strong focus:bg-bg-card focus:outline-none disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel || "AI responder"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 flex rounded-md border border-border bg-bg-card shadow-lg">
          <div className="min-w-[132px] py-1">
            {responders.map((responder) => (
              <button
                key={responder.id}
                type="button"
                onMouseEnter={() => setActiveResponderId(responder.id)}
                onFocus={() => setActiveResponderId(responder.id)}
                className={[
                  "flex h-8 w-full items-center justify-between gap-3 px-3 text-left text-xs transition-colors",
                  activeResponder?.id === responder.id
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                ].join(" ")}
                role="menuitem"
              >
                <span className="truncate">{responder.label}</span>
                <ChevronDown
                  className="-rotate-90 h-3.5 w-3.5 shrink-0 text-text-tertiary"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          {activeResponder && (
            <div className="min-w-[116px] border-l border-border py-1">
              {activeModels.map((model) => {
                const selected =
                  selectedResponder?.id === activeResponder.id &&
                  selectedModel?.modelId === model.modelId;
                return (
                  <button
                    key={model.modelId}
                    type="button"
                    onClick={() => {
                      onSelect(activeResponder.id, model);
                      setOpen(false);
                    }}
                    className="flex h-8 w-full items-center justify-between gap-3 px-3 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:bg-bg-hover focus:text-text-primary focus:outline-none"
                    role="menuitemradio"
                    aria-checked={selected}
                  >
                    <span className="truncate">{model.label}</span>
                    {selected && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 1.11 Inline AI — visible feedback while we wait for Claude's reply. Shows a
 * pulsing purple-ringed avatar (matching the agent ring used on PostItem) plus
 * a row of bouncing dots so the user knows their @-mention was received and
 * a response is generating. Auto-disappears when the reply lands or after the
 * 60s safety timeout.
 */
function ClaudeThinkingIndicator({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "C";
  return (
    <div
      className="px-5 py-3 bg-bg-secondary/40"
      aria-live="polite"
      aria-label={`${name} is thinking`}
    >
      <div className="flex items-center gap-2">
        <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-bg-hover text-text-secondary ring-2 ring-agent-accent animate-pulse">
          {initial}
        </div>
        <span className="text-xs font-medium text-text-primary">{name}</span>
        <span className="text-[11px] text-text-tertiary">is thinking</span>
        <span className="inline-flex items-end gap-[3px] ml-0.5" aria-hidden="true">
          <span
            className="h-1 w-1 rounded-full bg-agent-accent animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <span
            className="h-1 w-1 rounded-full bg-agent-accent animate-bounce"
            style={{ animationDelay: "150ms", animationDuration: "1s" }}
          />
          <span
            className="h-1 w-1 rounded-full bg-agent-accent animate-bounce"
            style={{ animationDelay: "300ms", animationDuration: "1s" }}
          />
        </span>
      </div>
    </div>
  );
}
