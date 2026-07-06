import { buildFocusBriefingDraft } from "./focus-briefing-draft";
import { decideFocusBriefingTurn } from "./focus-continuity";
import { classifyFocusWindow, focusWindowTitle } from "./focus-windows";
import { supabase } from "./supabase";
import type {
  FocusItem,
  FocusItemAnchorStatus,
  FocusItemThread,
  FocusMessage,
  FocusSession,
  WorkNode,
} from "./types";

export interface FocusItemWithThreads extends FocusItem {
  threads: Array<{
    id: string;
    title: string;
    type: WorkNode["type"];
    thread_role: FocusItemThread["thread_role"];
  }>;
}

export interface FocusHomeData {
  session: FocusSession;
  messages: FocusMessage[];
  items: FocusItemWithThreads[];
}

interface FocusItemThreadRow {
  id: string;
  focus_item_id: string;
  thread_id: string;
  thread_role: FocusItemThread["thread_role"];
  thread:
    | Pick<WorkNode, "id" | "title" | "type">
    | Pick<WorkNode, "id" | "title" | "type">[]
    | null;
}

async function getCandidateThreads(
  instanceId: string
): Promise<Pick<WorkNode, "id" | "title" | "updated_at">[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id,title,updated_at")
    .eq("instance_id", instanceId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []) as Pick<WorkNode, "id" | "title" | "updated_at">[];
}

async function getLatestActiveFocusSession(
  instanceId: string,
  actorId: string
): Promise<FocusSession | null> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("instance_id", instanceId)
    .eq("actor_id", actorId)
    .eq("status", "active")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as FocusSession | null;
}

async function getRecentFocusSessionIds(
  instanceId: string,
  actorId: string,
  currentSessionId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("actor_id", actorId)
    .eq("status", "active")
    .order("opened_at", { ascending: false })
    .limit(8);
  if (error) throw error;

  const ids = ((data ?? []) as Array<Pick<FocusSession, "id">>)
    .map((session) => session.id)
    .reverse();
  return ids.includes(currentSessionId) ? ids : [...ids, currentSessionId];
}

async function ensureFocusSession({
  instanceId,
  actorId,
  actorName,
}: {
  instanceId: string;
  actorId: string;
  actorName: string;
}): Promise<FocusSession> {
  const window = classifyFocusWindow(new Date());
  const activeSession = await getLatestActiveFocusSession(instanceId, actorId);
  const decision = decideFocusBriefingTurn({
    currentWindow: window,
    activeSession: activeSession
      ? {
          id: activeSession.id,
          windowKey: activeSession.window_key,
          mode: activeSession.mode,
          lastMessageAt: activeSession.updated_at,
        }
      : null,
    triggers: {},
  });

  if (decision.action === "resume" && activeSession) {
    return activeSession;
  }

  const { data: session, error: sessionError } = await supabase
    .from("focus_sessions")
    .upsert(
      {
        instance_id: instanceId,
        actor_id: actorId,
        mode: window.mode,
        window_key: window.windowKey,
        title: focusWindowTitle(window),
        metadata: {
          generated_reason: decision.reason,
          time_zone: window.timeZone,
        },
      },
      { onConflict: "instance_id,actor_id,window_key" }
    )
    .select("*")
    .single();
  if (sessionError) throw sessionError;

  const existingMessages = await getFocusMessages(session.id);
  if (existingMessages.some((message) => message.message_kind === "briefing")) {
    return session as FocusSession;
  }

  const briefingDedupeKey = `${window.windowKey}:briefing`;
  const candidateThreads = await getCandidateThreads(instanceId);
  const draft = buildFocusBriefingDraft({
    window,
    actorName,
    candidateThreads,
  });
  const briefing = await insertFocusMessage({
    instanceId,
    sessionId: session.id,
    actorId: null,
    role: "workos",
    messageKind: "briefing",
    body: draft.body,
    dedupeKey: briefingDedupeKey,
    metadata: { generated_reason: decision.reason },
  });

  for (const [index, item] of draft.items.entries()) {
    await insertFocusItem({
      instanceId,
      sessionId: session.id,
      messageId: briefing.id,
      title: item.title,
      body: item.body,
      itemType: item.itemType,
      anchorStatus: item.anchorStatus,
      priorityRank: index + 1,
      threadIds: item.threadIds,
      dedupeKey: `${window.windowKey}:item:${index + 1}`,
    });
  }

  return session as FocusSession;
}

export async function getFocusMessages(
  sessionId: string
): Promise<FocusMessage[]> {
  const { data, error } = await supabase
    .from("focus_messages")
    .select("*")
    .eq("focus_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FocusMessage[];
}

async function getFocusMessagesForSessions(
  sessionIds: string[]
): Promise<FocusMessage[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("focus_messages")
    .select("*")
    .in("focus_session_id", sessionIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FocusMessage[];
}

export async function getFocusItems(
  sessionId: string
): Promise<FocusItemWithThreads[]> {
  const { data: items, error } = await supabase
    .from("focus_items")
    .select("*")
    .eq("focus_session_id", sessionId)
    .order("priority_rank", { ascending: true });
  if (error) throw error;

  const itemRows = (items ?? []) as FocusItem[];
  if (itemRows.length === 0) return [];

  const { data: anchors, error: anchorError } = await supabase
    .from("focus_item_threads")
    .select("id,focus_item_id,thread_id,thread_role,thread:nodes(id,title,type)")
    .in(
      "focus_item_id",
      itemRows.map((item) => item.id)
    );
  if (anchorError) throw anchorError;

  const anchorsByItem = new Map<string, FocusItemWithThreads["threads"]>();
  for (const anchor of (anchors ?? []) as unknown as FocusItemThreadRow[]) {
    const thread = Array.isArray(anchor.thread) ? anchor.thread[0] : anchor.thread;
    if (!thread) continue;
    const threads = anchorsByItem.get(anchor.focus_item_id) ?? [];
    threads.push({
      id: thread.id,
      title: thread.title,
      type: thread.type,
      thread_role: anchor.thread_role,
    });
    anchorsByItem.set(anchor.focus_item_id, threads);
  }

  return itemRows.map((item) => ({
    ...item,
    threads: anchorsByItem.get(item.id) ?? [],
  }));
}

export async function getFocusHomeData({
  instanceId,
  actorId,
  actorName,
}: {
  instanceId: string;
  actorId: string;
  actorName: string;
}): Promise<FocusHomeData> {
  const session = await ensureFocusSession({ instanceId, actorId, actorName });
  const timelineSessionIds = await getRecentFocusSessionIds(
    instanceId,
    actorId,
    session.id
  );
  const [messages, items] = await Promise.all([
    getFocusMessagesForSessions(timelineSessionIds),
    getFocusItems(session.id),
  ]);
  return { session, messages, items };
}

export async function validateFocusSessionForActor({
  sessionId,
  instanceId,
  actorId,
}: {
  sessionId: string;
  instanceId: string;
  actorId: string;
}): Promise<FocusSession> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("instance_id", instanceId)
    .eq("actor_id", actorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Focus session not found");
  return data as FocusSession;
}

export async function insertFocusMessage({
  instanceId,
  sessionId,
  actorId,
  role,
  messageKind,
  body,
  dedupeKey = null,
  metadata = {},
}: {
  instanceId: string;
  sessionId: string;
  actorId: string | null;
  role: FocusMessage["role"];
  messageKind: FocusMessage["message_kind"];
  body: string;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<FocusMessage> {
  const payload = {
    instance_id: instanceId,
    focus_session_id: sessionId,
    actor_id: actorId,
    role,
    message_kind: messageKind,
    dedupe_key: dedupeKey,
    body: body.trim(),
    metadata,
  };
  const query = dedupeKey
    ? supabase.from("focus_messages").upsert(payload, {
        onConflict: "focus_session_id,message_kind,dedupe_key",
      })
    : supabase.from("focus_messages").insert(payload);

  const { data, error } = await query
    .select("*")
    .single();
  if (error) throw error;
  return data as FocusMessage;
}

export async function insertFocusItem({
  instanceId,
  sessionId,
  messageId,
  title,
  body,
  itemType,
  anchorStatus,
  priorityRank,
  threadIds,
  dedupeKey = null,
  metadata = {},
}: {
  instanceId: string;
  sessionId: string;
  messageId: string | null;
  title: string;
  body: string;
  itemType: FocusItem["item_type"];
  anchorStatus: FocusItemAnchorStatus;
  priorityRank: number;
  threadIds: string[];
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<FocusItem> {
  if (anchorStatus === "anchored" && threadIds.length === 0) {
    throw new Error("Anchored Focus items require at least one thread");
  }

  const { data, error } = await supabase.rpc(
    "rpc_upsert_focus_item_with_threads",
    {
      p_instance_id: instanceId,
      p_focus_session_id: sessionId,
      p_created_by_message_id: messageId,
      p_title: title,
      p_body: body,
      p_item_type: itemType,
      p_anchor_status: anchorStatus,
      p_priority_rank: priorityRank,
      p_thread_ids: threadIds,
      p_dedupe_key: dedupeKey,
      p_metadata: metadata,
    }
  );
  if (error) throw error;

  const item = Array.isArray(data) ? data[0] : data;
  if (!item) throw new Error("Focus item was not created");
  return item as FocusItem;
}
