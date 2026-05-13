// 1.11 Inline AI debug endpoint — runs the full agent pipeline
// (context assembly → Anthropic call → reply post) SYNCHRONOUSLY for a given
// node and returns each step's status as JSON. Bypasses Next's `after()`,
// which means failures surface immediately instead of vanishing into
// fire-and-forget land.
//
// Usage from a browser or curl:
//   GET /api/agents/debug?nodeId=<uuid>&workspaceId=<uuid>
//   GET /api/agents/debug?nodeId=<uuid>&workspaceId=<uuid>&dryRun=1
//     ↳ runs assembly + Anthropic but does NOT insert a reply post.
//   GET /api/agents/debug?nodeId=<uuid>&workspaceId=<uuid>&healthCheck=1
//     ↳ verifies env + Supabase connectivity only; no model call.
//
// Returns 200 with `{ ok: true, steps: {...}, durationMs }` when everything
// works, or 500 with `{ ok: false, failedAt, error, steps }` describing
// exactly which step blew up.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gatherNodeContext } from "@/lib/agents/node-context";
import {
  renderClaudePrompt,
  renderClaudeNotFoundPrompt,
} from "@/lib/agents/claude-prompt";
import { invokeClaude } from "@/lib/agents/claude";
import { postAgentReply } from "@/lib/agents/reply-poster";

interface DebugSteps {
  envCheck?: { hasKey: boolean; keyPrefix: string };
  claudeActor?: { id: string; name: string } | null;
  contextGather?: {
    ownThreadPosts: number;
    parentThreadPosts: number;
    siblingThreadCount: number;
    childThreadCount: number;
    ms: number;
  };
  claudePromptRender?: { systemChars: number; userChars: number; ms: number };
  anthropicCall?: { replyChars: number; ms: number };
  replyPosted?: { ms: number };
}

export async function GET(req: Request) {
  const t0 = Date.now();
  const url = new URL(req.url);
  const nodeId = url.searchParams.get("nodeId");
  const workspaceId = url.searchParams.get("workspaceId");
  const dryRun = url.searchParams.get("dryRun") === "1";
  const healthCheck = url.searchParams.get("healthCheck") === "1";

  const steps: DebugSteps = {};

  // Step 1 — env check.
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  steps.envCheck = {
    hasKey: apiKey.length > 0,
    keyPrefix: apiKey ? `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}` : "(missing)",
  };
  if (!steps.envCheck.hasKey) {
    return fail("envCheck", "ANTHROPIC_API_KEY is not set in this server's environment", steps, t0);
  }

  // Step 2 — find a Claude actor row (so we can post replies as them).
  const { data: claudeActor, error: actorErr } = await supabase
    .from("actors")
    .select("id, name, kind")
    .eq("kind", "agent")
    .ilike("name", "claude%")
    .limit(1)
    .maybeSingle();

  if (actorErr) {
    return fail("claudeActor", `Supabase query failed: ${actorErr.message}`, steps, t0);
  }
  if (!claudeActor) {
    steps.claudeActor = null;
    return fail(
      "claudeActor",
      "No actor with kind='agent' and name starting with 'claude' was found. Check the actors table.",
      steps,
      t0
    );
  }
  steps.claudeActor = { id: claudeActor.id, name: claudeActor.name };

  if (healthCheck) {
    return NextResponse.json({ ok: true, steps, durationMs: Date.now() - t0 });
  }

  if (!nodeId || !workspaceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query params: nodeId, workspaceId",
        steps,
        usage:
          "/api/agents/debug?nodeId=<uuid>&workspaceId=<uuid>[&dryRun=1][&healthCheck=1]",
      },
      { status: 400 }
    );
  }

  // Step 3 — context gather (agent-agnostic data fetch).
  const gatherStart = Date.now();
  let nodeCtx;
  try {
    nodeCtx = await gatherNodeContext(nodeId);
  } catch (err) {
    return fail("contextGather", errMessage(err), steps, t0);
  }
  if (!nodeCtx) {
    // Use the not-found stub prompt and short-circuit. Fail loudly in the
    // debug endpoint so the user sees that the nodeId is wrong rather than
    // getting a silently anaemic context.
    steps.contextGather = {
      ownThreadPosts: 0,
      parentThreadPosts: 0,
      siblingThreadCount: 0,
      childThreadCount: 0,
      ms: Date.now() - gatherStart,
    };
    const stub = renderClaudeNotFoundPrompt();
    steps.claudePromptRender = {
      systemChars: stub.systemPrompt.length,
      userChars: stub.userMessage.length,
      ms: 0,
    };
    return fail("contextGather", `Node not found: ${nodeId}`, steps, t0);
  }
  steps.contextGather = {
    ownThreadPosts: nodeCtx.ownThread.length,
    parentThreadPosts: nodeCtx.parentThread ? nodeCtx.parentThread.posts.length : 0,
    siblingThreadCount: nodeCtx.siblingThreads.length,
    childThreadCount: nodeCtx.childThreads.length,
    ms: Date.now() - gatherStart,
  };

  // Step 4 — Claude prompt render.
  const renderStart = Date.now();
  const ctx = renderClaudePrompt(nodeCtx);
  steps.claudePromptRender = {
    systemChars: ctx.systemPrompt.length,
    userChars: ctx.userMessage.length,
    ms: Date.now() - renderStart,
  };

  // Step 5 — Anthropic call.
  let reply: string;
  const callStart = Date.now();
  try {
    reply = await invokeClaude({
      systemPrompt: ctx.systemPrompt,
      userMessage: ctx.userMessage,
    });
  } catch (err) {
    return fail("anthropicCall", errMessage(err), steps, t0);
  }
  steps.anthropicCall = { replyChars: reply.length, ms: Date.now() - callStart };

  // Step 5 — post reply (skipped on dryRun).
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      steps,
      replyPreview: reply.slice(0, 500),
      durationMs: Date.now() - t0,
    });
  }

  const postStart = Date.now();
  try {
    await postAgentReply(nodeId, workspaceId, claudeActor.id, reply);
  } catch (err) {
    return fail("replyPosted", errMessage(err), steps, t0);
  }
  steps.replyPosted = { ms: Date.now() - postStart };

  return NextResponse.json({
    ok: true,
    steps,
    replyPreview: reply.slice(0, 500),
    durationMs: Date.now() - t0,
  });
}

function fail(
  failedAt: keyof DebugSteps | "claudeActor",
  error: string,
  steps: DebugSteps,
  t0: number
) {
  return NextResponse.json(
    { ok: false, failedAt, error, steps, durationMs: Date.now() - t0 },
    { status: 500 }
  );
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
