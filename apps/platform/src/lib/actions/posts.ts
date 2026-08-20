"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { getAgentSettings } from "../agent-settings";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import { getEffectiveAIStandards } from "../ai-standards-server";
import {
  revalidateNodePosts,
  revalidateThreadContextSheet,
  revalidateWorkspaceFeed,
} from "../cache";
import { recordWorkOSEvent } from "../events";
import {
  getNodePosts,
  getPostReactionSummaries,
  type PostRecord,
} from "../posts";
import {
  isValidReactionEmoji,
  type PostReactionSummary,
} from "../post-reactions";
import { findAgentMentions, type MentionedAgent } from "../agents/mention-detection";
import { buildRequestedAgentMentions } from "../agents/response-selection";
import {
  plainTextFromBody,
  type NodeContext,
} from "../agents/node-context";
import { renderClaudePrompt } from "../agents/claude-prompt";
import { streamClaude, type ClaudeUsageReport } from "../agents/claude";
import {
  modelSelectionMetadata,
  providerKeyForResponderName,
  resolveDefaultModelFromConfig,
  resolveModelSelection,
  type AgentModelSelection,
  type AgentModelSelectionInput,
} from "../agents/model-selection";
import {
  createStreamingAgentReply,
  updateStreamingAgentReply,
  type StreamingReplyHandle,
} from "../agents/reply-poster";
import { agentInvocationFailureReply } from "../agents/invocation-error";
import { routeAgentMentions } from "../agents/router";
import { isAgentRunConfirmation } from "../agents/confirmation";
import {
  appendAgentRunEvent,
  completeInlineAgentRun,
  createInlineAgentRun,
  failInlineAgentRun,
  getActiveInlineAgentRuns,
  linkInlineAgentRunResponse,
  queueAwaitingRunsForConfirmation,
  updateInlineAgentRunStage,
} from "../agents/runs";
import { processNextQueuedAgentRun } from "../agents/worker";
import { attachThreadContexts } from "./thread-context";
import { makeContextRouterCandidate } from "../context-router/candidates";
import { contextSourceProvenanceForNode } from "../context-router/provenance";
import {
  MIN_TURN_RESOLUTION_CONFIDENCE,
  routeAutomaticContextV2,
} from "../context-router/router";
import { resolveContextTurnWithFallback } from "../context-router/turn-resolver";
import {
  createContextPromptManifest,
  mergeInlineRuntimeIntoManifest,
} from "../context-router/manifest";
import type {
  ContextPromptManifest,
  ContextPromptManifestOverride,
  ContextRouterCandidate,
} from "../context-router/types";
import {
  isContextEventMetadata,
  scoreAutomaticContextTextMatch,
} from "../thread-context";
import {
  buildThreadContextSheetSeedUpdate,
  getThreadContextSheet,
  shouldUseThreadContextSheetForTurn,
  upsertThreadContextSheetRecord,
  type ThreadContextSheetUpdate,
  type ThreadContextSheetSeedDecision,
} from "../thread-context-sheet";
import {
  extractThreadPostTurnAnalysis,
  type PostTurnAnalysisResult,
  type ThreadContextPostTurnSourceFact,
} from "../thread-context-extractor";
import type { NodeType, ThreadContextSheet } from "../types";
import {
  getThreadWorkingModel,
  persistPostTurnClaimProposals,
  workingModelClaimsForManifest,
} from "../working-model";
import {
  buildAnswerReasonTraceSnapshot,
  hashTraceContent,
  loadReasonTraceEvidence,
  persistAnswerReasonTrace,
  type ReasonTraceClaimSnapshot,
} from "../reason-traces";

/**
 * Server action used by the 1.11 streaming-agent polling effect. Returns the
 * latest posts for a node directly from Supabase — `getNodePosts` is
 * deliberately uncached (see the docstring there for rationale).
 */
export async function pollNodePosts(nodeId: string): Promise<PostRecord[]> {
  const actor = await getCurrentActor();
  return getNodePosts(nodeId, actor.id);
}

export async function pollActiveInlineAgentRuns(
  nodeId: string
): Promise<Awaited<ReturnType<typeof getActiveInlineAgentRuns>>> {
  await getCurrentActor();
  return getActiveInlineAgentRuns(nodeId);
}

export async function pollNodeAnswerTracePostIds(
  nodeId: string
): Promise<string[]> {
  await getCurrentActor();
  const { data, error } = await supabase
    .from("reason_traces")
    .select("subject_id")
    .eq("thread_id", nodeId)
    .eq("trace_kind", "answer")
    .eq("subject_type", "post")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingReasonTracesError(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => String(row.subject_id));
}

/** Cadence at which we flush the accumulated streaming text to Supabase
 *  during an agent reply. Balances perceived latency against DB write rate.
 *  At 400ms + the client's 750ms poll cadence the user sees new text every
 *  ~1.2s on average — close enough to feel real-time. */
const STREAM_FLUSH_INTERVAL_MS = 400;
const AUTOMATIC_CONTEXT_CANDIDATE_POOL_LIMIT = 1000;
const AUTOMATIC_CONTEXT_PREVIEW_CHARS = 500;

async function getNodeInstanceId(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data.instance_id as string;
}

async function getPostBodyForTrace(
  postId: string,
  fallback: string
): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .select("body")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.body === "string" ? data.body : fallback;
}

export async function createPost(
  nodeId: string,
  workspaceId: string,
  body: string,
  options: {
    requestAgentResponse?: boolean;
    selectedAgent?: MentionedAgent | null;
    modelSelection?: AgentModelSelectionInput | null;
  } = {}
): Promise<void> {
  console.log(
    `[1.11] createPost ENTER nodeId=${nodeId.slice(0, 8)} bodyChars=${body.length}`
  );
  const trimmed = body.trim();
  if (!trimmed) return;
  const actor = await getCurrentActor();
  const plainText = plainTextFromBody(trimmed);
  const mentionedAgents = findAgentMentions(trimmed);
  const selectedProviderKey =
    options.modelSelection?.providerKey ??
    (options.selectedAgent
      ? providerKeyForResponderName(options.selectedAgent.name)
      : mentionedAgents.length === 1
        ? providerKeyForResponderName(mentionedAgents[0].name)
      : "inline_claude");
  const mayRequestAgent =
    (options.requestAgentResponse ?? false) || mentionedAgents.length > 0;
  const agentSettings = mayRequestAgent
    ? await getAgentSettings(actor.instance_id)
    : null;
  const selectedProviderSettings = agentSettings?.providers.find(
    (provider) => provider.provider_key === selectedProviderKey
  );
  const modelSelection = options.modelSelection
    ? resolveModelSelection(selectedProviderKey, options.modelSelection)
    : resolveDefaultModelFromConfig(
        selectedProviderKey,
        selectedProviderSettings?.config
      );
  const postMetadata =
    mayRequestAgent && modelSelection
      ? { agent_request: modelSelectionMetadata(modelSelection) }
      : {};

  const { data: insertedPost, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: actor.id,
      post_type: "post",
      body: trimmed,
      metadata: postMetadata,
    })
    .select(
      "id,node_id,actor_id,post_type,body,metadata,pinned,pinned_at,created_at,updated_at"
    )
    .single();
  if (error) throw error;

  const targetPost: PostRecord = {
    ...insertedPost,
    actor: { id: actor.id, name: actor.name, kind: "human" },
    reactions: [],
  } as PostRecord;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.created",
    subjectType: "post",
    subjectId: insertedPost.id,
    summary: `${actor.name} posted in this thread.`,
    metadata: {
      post_type: "post",
      body_preview: plainText.slice(0, 240),
      requested_agent_response: mayRequestAgent,
    },
    occurredAt: insertedPost.created_at,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  const confirmationAgentIds =
    mentionedAgents.length > 0
      ? mentionedAgents.map((agent) => agent.id)
      : options.selectedAgent
        ? [options.selectedAgent.id]
        : [];

  if (isAgentRunConfirmation(plainText)) {
    try {
      const queued = await queueAwaitingRunsForConfirmation({
        nodeId,
        workspaceId,
        requesterActorId: actor.id,
        confirmationPostId: targetPost.id,
        agentActorIds: confirmationAgentIds,
      });
      if (queued > 0) {
        after(async () => {
          await processNextQueuedAgentRun();
        });
        return;
      }
    } catch (err) {
      console.error("[agent-runtime] confirmation failed:", err);
    }
    return;
  }

  const mentions = buildRequestedAgentMentions({
    requestAgentResponse: options.requestAgentResponse ?? false,
    mentionedAgents,
    selectedAgent: options.selectedAgent ?? null,
  });
  console.log(
    `[1.11] createPost: detected ${mentions.length} agent mention(s)`,
    mentions.map((m) => `${m.name}(${m.id.slice(0, 8)})`)
  );

  if (mentions.length === 0) return;

  const precreatedInlineRunIds = await createImmediateInlineClaudeRuns({
    mentions,
    actor,
    nodeId,
    workspaceId,
    targetPost,
    modelSelection,
    inlineClaudeEnabled:
      agentSettings?.providers.some(
        (provider) =>
          provider.provider_key === "inline_claude" && provider.enabled
      ) ?? false,
  }).catch((err) => {
    console.error("[agent-runtime] failed to precreate inline run:", err);
    return new Map<string, string>();
  });

  after(async () => {
    await processAgentMentionsForPost({
      mentions,
      actor,
      nodeId,
      workspaceId,
      targetPost,
      plainText,
      modelSelection,
      precreatedInlineRunIds,
    });
  });
}

async function processAgentMentionsForPost(input: {
  mentions: MentionedAgent[];
  actor: Awaited<ReturnType<typeof getCurrentActor>>;
  nodeId: string;
  workspaceId: string;
  targetPost: PostRecord;
  plainText: string;
  modelSelection: AgentModelSelection | null;
  precreatedInlineRunIds: Map<string, string>;
}): Promise<void> {
  let activeThreadTitle = "Active thread";
  let contextManifest = createContextPromptManifest({
    resolvedQuery: input.plainText,
    taskType: "inline thread response",
    routingStatus: "partial",
    budgetChars: 0,
    warnings: ["Automatic context routing did not complete."],
  });
  try {
    const [previousUserTexts, recentThreadTexts, resolvedThreadTitle] =
      await Promise.all([
        getPreviousUserPostTexts({
          nodeId: input.nodeId,
          actorId: input.actor.id,
          targetPostId: input.targetPost.id,
        }),
        getPreviousThreadPostTexts({
          nodeId: input.nodeId,
          targetPostId: input.targetPost.id,
        }),
        getActiveThreadTitle(input.nodeId),
      ]);
    activeThreadTitle = resolvedThreadTitle;
    await updatePrecreatedInlineRunsStage(
      input.precreatedInlineRunIds,
      "Searching relevant chats..."
    );
    contextManifest = await attachAutomaticContextForPost({
      nodeId: input.nodeId,
      actorInstanceId: input.actor.instance_id,
      currentText: input.plainText,
      previousUserTexts,
      recentThreadTexts,
      activeThreadTitle,
    });
    await updatePrecreatedInlineRunsStage(
      input.precreatedInlineRunIds,
      "Loading selected context..."
    );
  } catch (err) {
    console.error("[thread-context] automatic attach failed:", err);
  }

  const [workingModel, threadSheet] = await Promise.all([
    getThreadWorkingModel(input.nodeId, input.actor.instance_id),
    getThreadContextSheet(input.nodeId),
  ]);
  const selectedClaims = workingModelClaimsForManifest(workingModel);
  const claimOverrides: ContextPromptManifestOverride[] = workingModel.groups
    .flatMap((group) => group.claims)
    .flatMap((claim) =>
      claim.excludedHere
        ? [
            {
              id: claim.excludedHere.id,
              target_type: claim.excludedHere.target_type,
              target_id: claim.excludedHere.target_id,
              directive: claim.excludedHere.directive,
              reason: claim.excludedHere.user_reason,
            },
          ]
        : []
    );
  const sheetBands = threadSheet ? usedThreadSheetBands(threadSheet) : [];
  contextManifest = {
    ...contextManifest,
    selected_claims: selectedClaims,
    applied_overrides: dedupeManifestOverrides([
      ...contextManifest.applied_overrides,
      ...claimOverrides,
    ]),
    thread_context_sheet_bands_used: sheetBands,
    thread_context_sheet: threadSheet
      ? {
          id: threadSheet.id,
          updated_at: threadSheet.updated_at,
          content_hash: hashTraceContent(threadSheet.markdown),
          bands_used: sheetBands,
        }
      : null,
  };

  const standards = await getEffectiveAIStandards(input.actor.instance_id).catch(
    (err) => {
      console.error("[1.11] ai standards fallback:", err);
      return DEFAULT_AI_STANDARDS;
    }
  );
  try {
    await routeAgentMentions({
      mentions: input.mentions,
      actor: input.actor,
      nodeId: input.nodeId,
      workspaceId: input.workspaceId,
      targetPost: input.targetPost,
      modelSelection: input.modelSelection,
      renderClaudePromptForContext: (ctx) => {
        const targetAwareCtx = ensureTargetPostInOwnThread(ctx, input.targetPost);
        console.log(
          `[1.11] context gathered (own=${targetAwareCtx.ownThread.length} attached=${targetAwareCtx.attachedContexts.length} parent=${targetAwareCtx.parentThread ? targetAwareCtx.parentThread.posts.length : 0} siblings=${targetAwareCtx.siblingThreads.length} children=${targetAwareCtx.childThreads.length}, standards=${standards.length})`
        );
        const prompt = renderClaudePrompt(targetAwareCtx, {
          targetPostId: input.targetPost.id,
          standards,
        });
        console.log(
          `[1.11] claude prompt rendered (system=${prompt.systemPrompt.length}c, user=${prompt.userMessage.length}c)`
        );
        return prompt;
      },
      precreatedInlineRunIds: input.precreatedInlineRunIds,
      scheduleInlineClaude: async (agent, ctxPrompt, selectedModel, runId) => {
        console.log(
          `[1.11] createPost: scheduling after() for ${agent.name}(${agent.id.slice(0, 8)}) model=${selectedModel?.modelId ?? "default"}`
        );
        await streamInlineClaudeReply({
          agent,
          nodeId: input.nodeId,
          workspaceId: input.workspaceId,
          ctxPrompt,
          modelSelection: selectedModel,
          runId,
          triggerPostId: input.targetPost.id,
          requesterActorId: input.actor.id,
          latestUserText: input.plainText,
          promptManifest: mergeInlineRuntimeIntoManifest(contextManifest, {
            systemPrompt: ctxPrompt.systemPrompt,
            userMessage: ctxPrompt.userMessage,
            attachmentSourcePostIds: ctxPrompt.attachments.map(
              (attachment) => attachment.source.postId
            ),
            modelSelection: selectedModel,
          }),
          threadSheet,
        });
      },
    });
  } catch (err) {
    console.error("[1.11] agent mention routing failed:", err);
    await failPrecreatedInlineRuns(input.precreatedInlineRunIds, err);
    await postAgentRoutingFailureReplies({
      mentions: input.mentions,
      nodeId: input.nodeId,
      workspaceId: input.workspaceId,
      error: err,
    });
  }
}

async function createImmediateInlineClaudeRuns(input: {
  mentions: MentionedAgent[];
  actor: Awaited<ReturnType<typeof getCurrentActor>>;
  nodeId: string;
  workspaceId: string;
  targetPost: PostRecord;
  modelSelection: AgentModelSelection | null;
  inlineClaudeEnabled: boolean;
}): Promise<Map<string, string>> {
  if (!input.inlineClaudeEnabled) return new Map();

  const inlineMentions = input.mentions.filter(
    (mention) => providerKeyForResponderName(mention.name) === "inline_claude"
  );
  if (inlineMentions.length === 0) return new Map();

  const selectedModel =
    input.modelSelection?.providerKey === "inline_claude"
      ? input.modelSelection
      : null;
  const runIds = new Map<string, string>();
  await Promise.all(
    inlineMentions.map(async (mention) => {
      const run = await createInlineAgentRun({
        instanceId: input.actor.instance_id,
        workspaceId: input.workspaceId,
        targetNodeId: input.nodeId,
        triggerPostId: input.targetPost.id,
        requesterActorId: input.actor.id,
        agentActorId: mention.id,
        currentStage: "Understanding the request...",
        metadata: {
          model_selection: selectedModel,
          created_before_context_retrieval: true,
        },
      });
      runIds.set(mention.id, run.id);
    })
  );

  return runIds;
}

async function updatePrecreatedInlineRunsStage(
  runIds: Map<string, string>,
  stage: string
): Promise<void> {
  if (runIds.size === 0) return;
  await Promise.all(
    [...runIds.values()].map((runId) =>
      updateInlineAgentRunStage(runId, stage).catch((error) => {
        console.error("[agent-runtime] failed to update inline run stage:", error);
      })
    )
  );
}

async function failPrecreatedInlineRuns(
  runIds: Map<string, string>,
  error: unknown
): Promise<void> {
  if (runIds.size === 0) return;
  await Promise.all(
    [...runIds.values()].map((runId) =>
      failInlineAgentRun({ runId, error }).catch((failError) => {
        console.error("[agent-runtime] failed to fail inline run:", failError);
      })
    )
  );
}

async function postAgentRoutingFailureReplies(input: {
  mentions: MentionedAgent[];
  nodeId: string;
  workspaceId: string;
  error: unknown;
}): Promise<void> {
  const failureReply = agentInvocationFailureReply("", input.error);
  await Promise.all(
    input.mentions.map(async (mention) => {
      try {
        await createStreamingAgentReply(
          input.nodeId,
          input.workspaceId,
          mention.id,
          failureReply,
          { recordStarted: false }
        );
      } catch (postError) {
        console.error(
          "[1.11] failed to post agent routing failure reply:",
          postError
        );
      }
    })
  );
}

async function attachAutomaticContextForPost(input: {
  nodeId: string;
  actorInstanceId: string;
  currentText: string;
  previousUserTexts: string[];
  recentThreadTexts: string[];
  activeThreadTitle: string;
}): Promise<ContextPromptManifest> {
  const turnResolution = await resolveContextTurnWithFallback({
    currentText: input.currentText,
    previousUserTexts: input.previousUserTexts,
    recentThreadTexts: input.recentThreadTexts,
    activeThreadTitle: input.activeThreadTitle || "Active thread",
  });
  const [
    { data: existingRows, error: existingError },
    existingThreadSheet,
    overrideResult,
  ] = await Promise.all([
    supabase
      .from("thread_context_attachments")
      .select("context_source_node_id,status,reason")
      .eq("thread_id", input.nodeId)
      .in("status", ["active", "removed", "ignored_for_suggestions"]),
    getThreadContextSheet(input.nodeId),
    supabase
      .from("context_retrieval_overrides")
      .select("id,target_type,target_id,directive,user_reason")
      .eq("thread_id", input.nodeId)
      .eq("target_type", "context_source")
      .is("cleared_at", null),
  ]);
  if (existingError) throw existingError;
  if (
    overrideResult.error &&
    !isMissingContextRetrievalOverridesError(overrideResult.error)
  ) {
    throw overrideResult.error;
  }

  const appliedOverrides: ContextPromptManifestOverride[] = (
    overrideResult.data ?? []
  ).map((override) => ({
    id: String(override.id),
    target_type: "context_source",
    target_id: String(override.target_id),
    directive: override.directive === "demote" ? "demote" : "exclude",
    reason:
      typeof override.user_reason === "string" ? override.user_reason : null,
  }));
  const activeAttachedSources = (existingRows ?? [])
    .filter((row) => row.status === "active")
    .map((row) => ({
      id: row.context_source_node_id,
      source_kind: "attached",
      reason:
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason
          : "Already active for this thread.",
    }));
  const baseManifest = createContextPromptManifest({
    resolvedQuery: turnResolution.resolvedQuery,
    taskType: "inline thread response",
    budgetChars: 0,
    turnResolution,
    includedSources: activeAttachedSources,
    appliedOverrides,
    threadContextSheetBandsUsed: existingThreadSheet
      ? usedThreadSheetBands(existingThreadSheet)
      : [],
  });
  if (
    !turnResolution.shouldRetrieve ||
    turnResolution.confidence < MIN_TURN_RESOLUTION_CONFIDENCE
  ) {
    return baseManifest;
  }

  const contextQueryText = turnResolution.resolvedQuery;

  const activeAttachmentCount = (existingRows ?? []).filter(
    (row) => row.status === "active"
  ).length;

  if (
    shouldUseThreadContextSheetForTurn({
      resolvedQuery: contextQueryText,
      sheet: existingThreadSheet,
      activeAttachmentCount,
    })
  ) {
    await upsertAutomaticThreadContextSheet({
      instanceId: input.actorInstanceId,
      threadId: input.nodeId,
      currentText: input.currentText,
      resolvedQuery: contextQueryText,
      decisions: [],
    });
    console.log("[context-router] skipped broad retrieval; thread sheet covered turn", {
      nodeId: input.nodeId,
      activeAttachmentCount,
      resolvedQuery: contextQueryText,
    });
    return baseManifest;
  }

  const { data: candidateNodeRows, error: candidateNodeError } = await supabase
    .from("nodes")
    .select("id,title,type,source_app,source_kind,updated_at,source_updated_at")
    .eq("instance_id", input.actorInstanceId)
    .is("archived_at", null)
    .eq("suggestion_status", "allowed")
    .neq("id", input.nodeId)
    .order("updated_at", { ascending: false })
    .limit(AUTOMATIC_CONTEXT_CANDIDATE_POOL_LIMIT);
  if (candidateNodeError) throw candidateNodeError;

  const excludedSourceIds = new Set(
    [
      ...(existingRows ?? []).map(
        (row) => row.context_source_node_id as string
      ),
      ...appliedOverrides
        .filter((override) => override.directive === "exclude")
        .map((override) => override.target_id),
    ]
  );
  const rowsById = new Map<
    string,
    NonNullable<typeof candidateNodeRows>[number]
  >();
  for (const row of candidateNodeRows ?? []) rowsById.set(row.id as string, row);

  const candidateRows = [...rowsById.values()].filter(
    (row) => !excludedSourceIds.has(row.id as string) && isNodeType(row.type)
  );
  if (candidateRows.length === 0) return baseManifest;

  const previewsByNodeId = await getBestPostPreviewsByNodeId(
    candidateRows.map((row) => row.id as string),
    contextQueryText
  );
  const candidates: ContextRouterCandidate[] = candidateRows.map((row) => {
    const id = row.id as string;
    const title = row.title as string;
    const preview = previewsByNodeId.get(id);
    const provenance = contextSourceProvenanceForNode({
      sourceApp: row.source_app,
      sourceKind: row.source_kind,
    });
    return {
      ...makeContextRouterCandidate({
        id,
        title,
        sourceApp: provenance.sourceApp,
        updatedAt: (row.updated_at as string | null) ?? null,
        sourcePostId: preview?.sourcePostId ?? null,
        sourceMessageId: preview?.sourceMessageId ?? null,
        text: `${title}\n${preview?.bodyPreview ?? ""}`.trim(),
        query: contextQueryText,
      }),
      sourceKind: provenance.sourceKind,
      sourceOrigin: provenance.sourceOrigin,
      sourceProvenance: provenance.sourceProvenance,
      sourcePostCount: preview?.sourcePostCount ?? 0,
      sourceBodyChars: preview?.sourceBodyChars ?? 0,
    };
  });

  const routed = await routeAutomaticContextV2({
    currentText: input.currentText,
    previousUserTexts: input.previousUserTexts,
    recentThreadTexts: input.recentThreadTexts,
    activeThreadTitle: input.activeThreadTitle || "Active thread",
    candidates,
    turnResolution,
  });
  const decisions = routed.decisions;
  const routedManifest: ContextPromptManifest = {
    ...routed.manifest,
    included_sources: [
      ...activeAttachedSources,
      ...routed.manifest.included_sources,
    ],
    applied_overrides: appliedOverrides,
    thread_context_sheet_bands_used: existingThreadSheet
      ? usedThreadSheetBands(existingThreadSheet)
      : [],
  };
  console.log("[context-router] manifest", routed.manifest);

  if (decisions.length === 0) return routedManifest;

  await attachThreadContexts({
    threadId: input.nodeId,
    attachedBy: "automatic",
    sources: decisions.map((decision) => ({
      sourceNodeId: decision.candidate.id,
      reason: decision.inclusionReason,
      sourcePostId: decision.sourcePostId,
      sourceMessageId: decision.sourceMessageId,
      metadata: { context_pack: decision.pack },
    })),
  });

  await upsertAutomaticThreadContextSheet({
    instanceId: input.actorInstanceId,
    threadId: input.nodeId,
    currentText: input.currentText,
    resolvedQuery: contextQueryText,
    decisions: decisions.map((decision) => ({
      sourceNodeId: decision.candidate.id,
      sourceTitle: decision.candidate.title,
      sourceRole: decision.pack.source_role ?? "supporting",
      confidence: decision.pack.relevance_confidence,
      sourcePostId: decision.sourcePostId,
      sourceMessageId: decision.sourceMessageId,
      usefulFacts: decision.pack.useful_facts,
    })),
  });
  return routedManifest;
}

async function upsertAutomaticThreadContextSheet(input: {
  instanceId: string;
  threadId: string;
  currentText: string;
  resolvedQuery: string;
  decisions: ThreadContextSheetSeedDecision[];
}): Promise<void> {
  const didUpsert = await upsertThreadContextSheetRecord({
    instanceId: input.instanceId,
    threadId: input.threadId,
    update: buildThreadContextSheetSeedUpdate({
      currentText: input.currentText,
      resolvedQuery: input.resolvedQuery,
      decisions: input.decisions,
    }),
  });

  if (didUpsert) revalidateThreadContextSheet(input.threadId);
}

async function updateThreadContextSheetAfterReply(input: {
  instanceId: string;
  threadId: string;
  threadTitle: string;
  userText: string;
  assistantText: string;
  runId: string;
  workingModelClaims: ContextPromptManifest["selected_claims"];
}): Promise<PostTurnAnalysisResult> {
  if (!input.assistantText.trim()) {
    return {
      sheetUpdate: {},
      answerAnchors: [],
      proposedClaims: [],
      associationStatus: "unavailable",
      associationWarnings: ["The response did not contain text to associate."],
    };
  }

  const [existingSheet, attachedContextFacts] = await Promise.all([
    getThreadContextSheet(input.threadId),
    getAttachedContextFactsForThread(input.threadId),
  ]);

  const analysis = await extractThreadPostTurnAnalysis({
    threadTitle: input.threadTitle,
    userText: input.userText,
    assistantText: input.assistantText,
    existingSheet,
    attachedContextFacts,
    workingModelClaims: input.workingModelClaims.map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      statement: claim.statement,
      evidenceRefs: claim.evidence_refs,
    })),
  });
  const update = analysis.sheetUpdate;
  if (isThreadContextSheetUpdateEmpty(update)) return analysis;

  const didUpsert = await upsertThreadContextSheetRecord({
    instanceId: input.instanceId,
    threadId: input.threadId,
    update,
  });
  if (!didUpsert) {
    await appendAgentRunEvent(
      input.runId,
      "working_model_sync_pending",
      "Thread dossier update needs reconciliation.",
      {
        projection: "thread_context_sheet",
        sheet_update: update,
        proposed_claims: analysis.proposedClaims,
      }
    );
    throw new Error("Thread dossier update was not persisted.");
  }

  revalidateThreadContextSheet(input.threadId);
  await appendAgentRunEvent(input.runId, "memory_updated", "Thread memory updated.", {
    active_working_count: update.activeWorking?.length ?? 0,
    short_term_count: update.shortTerm?.length ?? 0,
    long_term_count: update.longTerm?.length ?? 0,
  }).catch((eventError) => {
    console.error("[thread-context] failed to append memory event:", eventError);
  });
  return analysis;
}

async function getAttachedContextFactsForThread(
  threadId: string
): Promise<ThreadContextPostTurnSourceFact[]> {
  const { data, error } = await supabase
    .from("thread_context_attachments")
    .select(
      "metadata,source_node:nodes!thread_context_attachments_context_source_node_id_fkey(title)"
    )
    .eq("thread_id", threadId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) throw error;

  return (data ?? []).flatMap((row): ThreadContextPostTurnSourceFact[] => {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const pack = isRecord(metadata.context_pack) ? metadata.context_pack : {};
    const facts = contextPackFacts(pack);
    if (facts.length === 0) return [];

    const sourceNode = Array.isArray(row.source_node)
      ? row.source_node[0]
      : row.source_node;
    const sourceTitle =
      isRecord(sourceNode) && typeof sourceNode.title === "string"
        ? sourceNode.title
        : "Attached context";

    return [
      {
        sourceTitle,
        sourceRole: contextPackSourceRole(pack.source_role),
        facts,
      },
    ];
  });
}

function contextPackFacts(pack: Record<string, unknown>): string[] {
  const facts =
    Array.isArray(pack.useful_facts)
      ? pack.useful_facts
      : Array.isArray(pack.usefulFacts)
        ? pack.usefulFacts
        : [];
  return facts
    .filter((fact): fact is string => typeof fact === "string")
    .map((fact) => fact.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function contextPackSourceRole(
  value: unknown
): ThreadContextPostTurnSourceFact["sourceRole"] {
  if (value === "core" || value === "watchlist") return value;
  return "supporting";
}

function isThreadContextSheetUpdateEmpty(
  update: ThreadContextSheetUpdate
): boolean {
  return (
    (update.activeWorking?.length ?? 0) === 0 &&
    (update.shortTerm?.length ?? 0) === 0 &&
    (update.longTerm?.length ?? 0) === 0
  );
}

async function getActiveThreadTitle(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("title")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  return title || "Active thread";
}

async function getPreviousUserPostTexts(input: {
  nodeId: string;
  actorId: string;
  targetPostId: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id,body")
    .eq("node_id", input.nodeId)
    .eq("actor_id", input.actorId)
    .eq("post_type", "post")
    .neq("id", input.targetPostId)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;

  return (data ?? [])
    .map((row) =>
      typeof row.body === "string" ? plainTextFromBody(row.body) : ""
    )
    .filter((text) => text.trim().length > 0);
}

async function getPreviousThreadPostTexts(input: {
  nodeId: string;
  targetPostId: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id,body,metadata,actor:actors(name,kind),created_at")
    .eq("node_id", input.nodeId)
    .eq("post_type", "post")
    .neq("id", input.targetPostId)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;

  return (data ?? [])
    .filter(
      (row) =>
        !isContextEventMetadata(
          isRecord(row.metadata) ? row.metadata : null
        )
    )
    .map((row) => {
      const text =
        typeof row.body === "string" ? plainTextFromBody(row.body).trim() : "";
      if (!text) return "";
      const label = actorLabel(row.actor);
      return label ? `${label}: ${text}` : text;
    })
    .filter((text) => text.length > 0)
    .reverse();
}

interface AutomaticContextPostPreview {
  bodyPreview: string;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  score: number;
  matchedTokens: string[];
  sourcePostCount: number;
  sourceBodyChars: number;
}

async function getBestPostPreviewsByNodeId(
  nodeIds: string[],
  userText: string
): Promise<Map<string, AutomaticContextPostPreview>> {
  if (nodeIds.length === 0) return new Map();

  const bestByNodeId = new Map<string, AutomaticContextPostPreview>();
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("posts")
      .select("id,node_id,body,metadata,created_at")
      .in("node_id", nodeIds)
      .eq("post_type", "post")
      .not("body", "is", null)
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      const nodeId = metadataString(row.node_id);
      const postId = metadataString(row.id);
      const body = typeof row.body === "string" ? row.body : "";
      if (!nodeId || !postId || !body) continue;

      const text = plainTextFromBody(body);
      const existing = bestByNodeId.get(nodeId) ?? {
        bodyPreview: "",
        sourcePostId: null,
        sourceMessageId: null,
        score: 0,
        matchedTokens: [],
        sourcePostCount: 0,
        sourceBodyChars: 0,
      };
      existing.sourcePostCount += 1;
      existing.sourceBodyChars += text.length;

      const match = scoreAutomaticContextTextMatch(userText, text);
      if (match.score > existing.score) {
        existing.bodyPreview = previewAroundMatch(text, match.matchedTokens);
        existing.sourcePostId = postId;
        existing.sourceMessageId = metadataString(row.metadata?.source_message_id);
        existing.score = match.score;
        existing.matchedTokens = match.matchedTokens;
      }

      bestByNodeId.set(nodeId, existing);
    }

    if (!data || data.length < pageSize) break;
  }

  return bestByNodeId;
}

function previewAroundMatch(text: string, matchedTokens: string[]): string {
  const normalizedText = text.toLocaleLowerCase();
  const firstMatchIndex = matchedTokens
    .map((token) => normalizedText.indexOf(token.toLocaleLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const center = firstMatchIndex ?? 0;
  const start = Math.max(0, center - Math.floor(AUTOMATIC_CONTEXT_PREVIEW_CHARS / 3));
  const end = Math.min(text.length, start + AUTOMATIC_CONTEXT_PREVIEW_CHARS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function actorLabel(value: unknown): string | null {
  const actor = Array.isArray(value) ? value[0] : value;
  if (!isRecord(actor)) return null;
  const name = typeof actor.name === "string" ? actor.name.trim() : "";
  if (name) return name;
  const kind = typeof actor.kind === "string" ? actor.kind.trim() : "";
  return kind || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usedThreadSheetBands(sheet: ThreadContextSheet): string[] {
  return [
    sheet.active_working.length > 0 ? "active_working" : null,
    sheet.short_term.length > 0 ? "short_term" : null,
    sheet.long_term.length > 0 ? "long_term" : null,
  ].filter((band): band is string => Boolean(band));
}

function dedupeManifestOverrides(
  overrides: ContextPromptManifestOverride[]
): ContextPromptManifestOverride[] {
  return [
    ...new Map(overrides.map((override) => [override.id, override])).values(),
  ];
}

function isMissingContextRetrievalOverridesError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    /context_retrieval_overrides/i.test(message)
  );
}

function isMissingReasonTracesError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    /reason_traces/i.test(message)
  );
}

function isNodeType(value: unknown): value is NodeType {
  return value === "workspace" || value === "stack" || value === "card";
}

async function streamInlineClaudeReply(input: {
  agent: MentionedAgent;
  nodeId: string;
  workspaceId: string;
  ctxPrompt: ReturnType<typeof renderClaudePrompt>;
  modelSelection: AgentModelSelection | null;
  runId: string;
  triggerPostId: string;
  requesterActorId: string;
  latestUserText: string;
  promptManifest: ContextPromptManifest;
  threadSheet: ThreadContextSheet | null;
}): Promise<void> {
  const t0 = Date.now();
  console.log(`[1.11] after(): START for ${input.agent.name}`);
  const promptManifest = input.promptManifest;

  // Streaming flow:
  //   1. Wait for Claude's first chunk → insert the reply post seeded
  //      with that text. The post is visible to clients via the next
  //      revalidation/poll cycle. This replaces the "Claude is thinking"
  //      placeholder with the actual reply, growing in real-time.
  //   2. Continue streaming. Every STREAM_FLUSH_INTERVAL_MS, update the
  //      post body in-place with the full accumulated text.
  //   3. After the stream ends, do one final update with the canonical
  //      complete text so no chunks are lost in the last flush window.
  let handle: StreamingReplyHandle | null = null;
  let accumulated = "";
  let lastFlush = 0;
  let flushCount = 0;
  let markedWriting = false;
  let usageReport: ClaudeUsageReport | null = null;

  try {
    await updateInlineAgentRunStage(input.runId, "Waiting for Claude...");

    for await (const event of streamClaude({
      systemPrompt: input.ctxPrompt.systemPrompt,
      userMessage: input.ctxPrompt.userMessage,
      attachments: input.ctxPrompt.attachments,
      model: input.modelSelection?.modelId,
    })) {
      if (event.type === "delta") {
        accumulated += event.text;

        if (!handle) {
          if (!markedWriting) {
            await updateInlineAgentRunStage(input.runId, "Writing the reply...");
            markedWriting = true;
          }
          // First chunk → create the post now. The user sees Claude
          // appear in the thread with their first sentence already
          // visible instead of a long blank wait.
          handle = await createStreamingAgentReply(
            input.nodeId,
            input.workspaceId,
            input.agent.id,
            accumulated
          );
          await linkInlineAgentRunResponse(input.runId, handle.postId);
          lastFlush = Date.now();
          console.log(
            `[1.11] after(): first delta + post created (id=${handle.postId.slice(0, 8)}, ${Date.now() - t0}ms)`
          );
          continue;
        }

        const now = Date.now();
        if (now - lastFlush >= STREAM_FLUSH_INTERVAL_MS) {
          await updateStreamingAgentReply(
            handle,
            input.nodeId,
            input.workspaceId,
            accumulated
          );
          flushCount++;
          lastFlush = now;
        }
      } else if (event.type === "complete") {
        // Canonical final text — supersedes anything we accumulated, in
        // case the SDK provided trailing content not in chunk deltas.
        accumulated = event.text;
        usageReport = event.usage;
      }
    }

    if (!handle) {
      if (!markedWriting) {
        await updateInlineAgentRunStage(input.runId, "Writing the reply...");
        markedWriting = true;
      }
      // Stream completed without yielding any text deltas (e.g. an
      // entirely empty response). Create a placeholder post so the user
      // gets feedback instead of an indefinitely-spinning indicator.
      handle = await createStreamingAgentReply(
        input.nodeId,
        input.workspaceId,
        input.agent.id,
        accumulated || "(Claude returned an empty response.)"
      );
      await linkInlineAgentRunResponse(input.runId, handle.postId);
    } else {
      // Final flush — ensures the last buffered tokens are visible.
      await updateStreamingAgentReply(
        handle,
        input.nodeId,
        input.workspaceId,
        accumulated
      );
      flushCount++;
    }

    const finalPromptManifest = usageReport
      ? {
          ...promptManifest,
          claude_usage: usageReport.usage,
          estimated_cost_usd: usageReport.estimated_cost_usd,
          model: usageReport.model,
          request_id: usageReport.request_id,
        }
      : promptManifest;

    await completeInlineAgentRun({
      runId: input.runId,
      manifest: finalPromptManifest,
      summary: accumulated.slice(0, 500),
    });

    let instanceId: string | null = null;
    if (handle) {
      try {
        instanceId = await getNodeInstanceId(input.nodeId);
        await recordWorkOSEvent({
          instanceId,
          workspaceId: input.workspaceId,
          nodeId: input.nodeId,
          actorId: input.agent.id,
          eventType: "agent.reply_completed",
          subjectType: "post",
          subjectId: handle.postId,
          summary: `${input.agent.name} completed an AI reply.`,
          metadata: {
            flush_count: flushCount,
            body_preview: accumulated.slice(0, 240),
            ...(usageReport
              ? {
                  claude_usage: usageReport.usage,
                  estimated_cost_usd: usageReport.estimated_cost_usd,
                  model: usageReport.model,
                  request_id: usageReport.request_id,
                }
              : {}),
          },
        });
      } catch (eventError) {
        console.error("[1.11] failed to record reply completion:", eventError);
      }
    }

    const resolvedInstanceId =
      instanceId ?? (await getNodeInstanceId(input.nodeId));
    let postTurnAnalysis: PostTurnAnalysisResult | null = null;
    let postTurnWarning: string | null = null;
    try {
      postTurnAnalysis = await updateThreadContextSheetAfterReply({
        instanceId: resolvedInstanceId,
        threadId: input.nodeId,
        threadTitle: await getActiveThreadTitle(input.nodeId),
        userText: input.latestUserText,
        assistantText: accumulated,
        runId: input.runId,
        workingModelClaims: promptManifest.selected_claims,
      });
    } catch (memoryError) {
      postTurnWarning = "Structured answer association was unavailable.";
      console.error("[thread-context] post-turn memory extraction failed:", memoryError);
    }

    if (handle) {
      if (postTurnAnalysis && postTurnAnalysis.proposedClaims.length > 0) {
        await persistPostTurnClaimProposals({
          instanceId: resolvedInstanceId,
          threadId: input.nodeId,
          triggerPostId: input.triggerPostId,
          responsePostId: handle.postId,
          requesterActorId: input.requesterActorId,
          agentActorId: input.agent.id,
          claims: postTurnAnalysis.proposedClaims,
        }).catch(async (claimError) => {
          console.error(
            "[working-model] failed to persist post-turn claims:",
            claimError
          );
          await appendAgentRunEvent(
            input.runId,
            "working_model_sync_pending",
            "Typed Working Model updates need reconciliation.",
            {
              response_post_id: handle?.postId ?? null,
              trigger_post_id: input.triggerPostId,
              proposed_claims: postTurnAnalysis?.proposedClaims ?? [],
              error:
                claimError instanceof Error
                  ? claimError.message
                  : String(claimError),
            }
          ).catch(() => undefined);
        });
      }
      try {
        const [evidence, storedResponseBody] = await Promise.all([
          loadReasonTraceEvidence(
            promptManifest.selected_claims.map((claim) => claim.id),
            resolvedInstanceId
          ),
          getPostBodyForTrace(handle.postId, accumulated),
        ]);
        const claimSnapshots: ReasonTraceClaimSnapshot[] =
          promptManifest.selected_claims.map((claim) => ({
            id: claim.id,
            kind: claim.kind,
            statement: claim.statement,
            body: null,
            status: claim.status,
            posture: claim.posture,
            cached_score: claim.cached_score,
            factors: claim.factors,
            evidence_refs: claim.evidence_refs,
            superseded_by_primitive_id: claim.superseded_by_primitive_id,
            updated_at: claim.updated_at,
          }));
        const built = buildAnswerReasonTraceSnapshot({
          generatedAt: new Date().toISOString(),
          responsePostId: handle.postId,
          threadId: input.nodeId,
          responseBody: accumulated,
          responseContentForHash: storedResponseBody,
          triggerPostId: input.triggerPostId,
          request: {
            resolved_query: promptManifest.resolved_query,
            task_type: promptManifest.task_type,
            turn_resolution: {
              should_retrieve:
                promptManifest.turn_resolution.shouldRetrieve,
              confidence: promptManifest.turn_resolution.confidence,
              reason: promptManifest.turn_resolution.reason,
            },
          },
          threadSheet: input.threadSheet,
          claims: claimSnapshots,
          retrieval: {
            budget_chars: promptManifest.context_budget_chars,
            estimated_prompt_chars: promptManifest.estimated_prompt_chars,
            included: promptManifest.included_sources,
            omitted: promptManifest.omitted_sources,
            overrides_applied: promptManifest.applied_overrides.map(
              (override) => override.id
            ),
            warnings: promptManifest.warnings,
          },
          evidence,
          runtime: {
            agent_run_id: input.runId,
            provider_key: "inline_claude",
            model_key:
              usageReport?.model ??
              promptManifest.model_selection?.model_id ??
              null,
            request_id: usageReport?.request_id ?? null,
            router_version: promptManifest.router_version,
            extractor_version: postTurnAnalysis
              ? "thread-context-v2"
              : null,
          },
          associationStatus: postTurnAnalysis
            ? postTurnAnalysis.associationStatus
            : "failed",
          routingStatus: promptManifest.routing_status,
          structuredAnchors: postTurnAnalysis?.answerAnchors,
          warnings: [
            ...promptManifest.warnings,
            ...(postTurnAnalysis?.associationWarnings ?? []),
            ...(postTurnWarning ? [postTurnWarning] : []),
          ],
        });
        const traceId = await persistAnswerReasonTrace({
          instanceId: resolvedInstanceId,
          threadId: input.nodeId,
          agentRunId: input.runId,
          built,
        });
        await appendAgentRunEvent(
          input.runId,
          "trace_created",
          "Answer trace created.",
          { trace_id: traceId, response_post_id: handle.postId, status: built.status }
        );
      } catch (traceError) {
        console.error("[reason-trace] failed to finalize answer trace:", traceError);
        await appendAgentRunEvent(
          input.runId,
          "trace_failed",
          "Answer trace unavailable.",
          {
            response_post_id: handle.postId,
            error:
              traceError instanceof Error
                ? traceError.message
                : String(traceError),
          }
        ).catch(() => undefined);
      }
    }

    console.log(
      `[1.11] after(): stream finalized ✓ for ${input.agent.name} (flushes=${flushCount}, chars=${accumulated.length}, total ${Date.now() - t0}ms)`
    );
  } catch (err) {
    console.error("[1.11] agent invocation failed:", err);
    try {
      await failInlineAgentRun({
        runId: input.runId,
        manifest: promptManifest,
        error: err,
      });
    } catch (runError) {
      console.error("[1.11] failed to mark inline run failed:", runError);
    }
    // Best-effort: always leave a visible post. Provider failures before the
    // first streamed token otherwise look like an infinite thinking state.
    const failureReply = agentInvocationFailureReply(accumulated, err);
    try {
      if (handle) {
        await updateStreamingAgentReply(
          handle,
          input.nodeId,
          input.workspaceId,
          failureReply
        );
      } else {
        handle = await createStreamingAgentReply(
          input.nodeId,
          input.workspaceId,
          input.agent.id,
          failureReply,
          { recordStarted: false }
        );
      }
    } catch {
      /* ignore — we already logged the original error */
    }
    if (handle) {
      await linkInlineAgentRunResponse(input.runId, handle.postId).catch(
        () => undefined
      );
      const instanceId = await getNodeInstanceId(input.nodeId);
      await recordWorkOSEvent({
        instanceId,
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        actorId: input.agent.id,
        eventType: "agent.reply_failed",
        subjectType: "post",
        subjectId: handle.postId,
        summary: `${input.agent.name} failed to complete an AI reply.`,
        metadata: { body_preview: failureReply.slice(0, 240) },
      });
    }
  }
}

function ensureTargetPostInOwnThread(
  ctx: NodeContext,
  targetPost: PostRecord
): NodeContext {
  if (ctx.ownThread.some((p) => p.id === targetPost.id)) return ctx;
  return {
    ...ctx,
    ownThread: [targetPost, ...ctx.ownThread].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  };
}

export async function updatePost(
  postId: string,
  nodeId: string,
  workspaceId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("posts")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.updated",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} updated a post in this thread.`,
    metadata: { body_preview: plainTextFromBody(trimmed).slice(0, 240) },
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function deletePost(
  postId: string,
  nodeId: string,
  workspaceId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.deleted",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} deleted a post from this thread.`,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function pinPost(
  postId: string,
  nodeId: string,
  workspaceId: string,
  pinned: boolean
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("posts")
    .update({
      pinned,
      pinned_at: pinned ? new Date().toISOString() : null,
    })
    .eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: pinned ? "post.pinned" : "post.unpinned",
    subjectType: "post",
    subjectId: postId,
    summary: pinned
      ? `${actor.name} pinned a post in this thread.`
      : `${actor.name} unpinned a post in this thread.`,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function togglePostReaction(
  postId: string,
  nodeId: string,
  workspaceId: string,
  emoji: string
): Promise<PostReactionSummary[]> {
  const normalizedEmoji = emoji.trim();
  if (!isValidReactionEmoji(normalizedEmoji)) {
    throw new Error("Invalid reaction emoji.");
  }

  const actor = await getCurrentActor();
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,post_type")
    .eq("id", postId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post || post.post_type !== "post") {
    throw new Error("Reactions are only available on normal posts.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("actor_id", actor.id)
    .eq("emoji", normalizedEmoji)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_reactions").insert({
      post_id: postId,
      actor_id: actor.id,
      emoji: normalizedEmoji,
    });
    if (error) throw error;
  }

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: existing ? "post.reaction_removed" : "post.reaction_added",
    subjectType: "post",
    subjectId: postId,
    summary: existing
      ? `${actor.name} removed a reaction from a post.`
      : `${actor.name} reacted to a post.`,
    metadata: { emoji: normalizedEmoji },
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  return getPostReactionSummaries(postId, actor.id);
}
