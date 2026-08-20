import { ArrowLeft, ChevronRight, Info, Sparkles } from "lucide-react";
import type { AnswerTraceSummary } from "@/lib/working-model";
import { ChangedStateNotice } from "./changed-state-notice";
import { WorkingModelCorrectionControls } from "./working-model-correction-controls";

interface ReasonTraceViewProps {
  trace: AnswerTraceSummary;
  threadId: string;
  workspaceId: string;
  overrideIdsByClaim: Record<string, string>;
  onBack: () => void;
}

export function ReasonTraceView({
  trace,
  threadId,
  workspaceId,
  overrideIdsByClaim,
  onBack,
}: ReasonTraceViewProps) {
  const { snapshot } = trace;
  const changedClaimIds = new Set(
    trace.changedClaims.map(({ claimId }) => claimId)
  );
  const claimById = new Map(
    snapshot.working_model.claims.map((claim) => [claim.id, claim])
  );
  const restedOnClaimIds = [
    ...new Set(snapshot.answer.anchors.flatMap((anchor) => anchor.belief_refs)),
  ];
  const restedOnClaims = restedOnClaimIds.flatMap((claimId) => {
    const claim = claimById.get(claimId);
    return claim ? [claim] : [];
  });
  const restedOnClaimIdSet = new Set(restedOnClaimIds);
  const alsoAvailableClaims = snapshot.working_model.claims.filter(
    (claim) => !restedOnClaimIdSet.has(claim.id)
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft size={13} />
          Back to working model
        </button>
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            <Sparkles size={12} className="text-agent-accent" />
            Why this answer
          </div>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Snapshot saved {formatTraceDate(trace.createdAt)}
          </p>
        </div>
      </div>

      <ChangedStateNotice
        changedClaims={trace.changedClaims}
        responseEdited={trace.responseEdited}
      />

      {trace.status !== "complete" && (
        <div className="flex gap-2 rounded-md border border-status-review/30 bg-status-review/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          <Info size={13} className="mt-0.5 shrink-0 text-status-review" />
          Some answer associations were unavailable. The saved context and runtime details are still shown.
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
          Answer stance
        </h3>
        <div className="rounded-lg border border-border bg-bg-card px-3 py-3">
          <p className="text-sm font-medium leading-relaxed text-text-primary">
            {trace.summary}
          </p>
          {snapshot.answer.anchors.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {snapshot.answer.anchors.slice(0, 4).map((anchor) => (
                <div key={anchor.id} className="flex gap-2 text-xs leading-relaxed text-text-secondary">
                  <ChevronRight size={12} className="mt-0.5 shrink-0 text-text-tertiary" />
                  <span>{anchor.statement}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            Rested on
          </h3>
          <p className="mt-1 text-xs text-text-tertiary">{trace.evidenceSummary}</p>
        </div>
        {restedOnClaims.length > 0 ? (
          <div className="space-y-2">
            {restedOnClaims.map((claim) => {
              const claimEvidence = snapshot.evidence.filter((evidence) =>
                claim.evidence_refs.includes(evidence.id)
              );
              return (
                <details
                  key={claim.id}
                  className="rounded-lg border border-border bg-bg-card open:border-border-strong"
                >
                  <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                        {claimKindLabel(claim.kind)}
                      </span>
                      <span className="rounded-full border border-border bg-bg-hover px-2 py-0.5 text-[10px] text-text-secondary">
                        {postureLabel(claim.posture)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug text-text-primary">
                      {claim.statement}
                    </p>
                  </summary>
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    {claim.body && (
                      <p className="text-xs leading-relaxed text-text-secondary">{claim.body}</p>
                    )}
                    {claim.factors.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                          Confidence posture
                        </h4>
                        {claim.factors.map((factor, index) => (
                          <p key={`${factor.code}-${index}`} className="text-xs leading-relaxed text-text-secondary">
                            {factor.explanation}
                          </p>
                        ))}
                      </div>
                    )}
                    {claimEvidence.length > 0 && (
                      <details className="rounded-md border border-border bg-bg-primary">
                        <summary className="cursor-pointer list-none rounded-md px-2.5 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          Evidence · {claimEvidence.length}
                        </summary>
                        <div className="space-y-2 border-t border-border px-2.5 py-2">
                          {claimEvidence.map((evidence) => (
                            <div key={evidence.id} className="text-xs leading-relaxed text-text-secondary">
                              <div className="font-medium text-text-primary">{evidence.source_label}</div>
                              <div className="text-text-tertiary">
                                {evidence.excerpt ?? "Source detail is no longer available."}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    <WorkingModelCorrectionControls
                      claimId={claim.id}
                      statement={claim.statement}
                      threadId={threadId}
                      workspaceId={workspaceId}
                      currentOverrideId={overrideIdsByClaim[claim.id] ?? null}
                      disabled={changedClaimIds.has(claim.id)}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-text-tertiary">
            No structured beliefs were associated with this response.
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
          Why these were in play
        </h3>
        <div className="rounded-lg border border-border bg-bg-card px-3 py-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            {snapshot.request.turn_resolution.reason}
          </p>
          {snapshot.retrieval.included.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              {snapshot.retrieval.included.slice(0, 4).map((source, index) => (
                <div key={manifestKey(source, index)} className="text-xs text-text-tertiary">
                  {manifestText(source, "reason") ?? manifestText(source, "title") ?? "Relevant context was included."}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <details className="rounded-lg border border-border bg-bg-card">
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Diagnostics
        </summary>
        <div className="space-y-2 border-t border-border px-3 py-3 text-xs leading-relaxed text-text-tertiary">
          <p>Model: {snapshot.runtime.model_key ?? "Not recorded"}</p>
          <p>Context budget: {snapshot.retrieval.budget_chars.toLocaleString()} characters</p>
          <p>Estimated prompt: {snapshot.retrieval.estimated_prompt_chars.toLocaleString()} characters</p>
          <p>Omitted context: {snapshot.retrieval.omitted.length}</p>
          {alsoAvailableClaims.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-text-secondary">
                Also available in context
              </p>
              {alsoAvailableClaims.map((claim) => (
                <p key={claim.id}>{claim.statement}</p>
              ))}
            </div>
          )}
          {snapshot.warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="text-status-review">{warning}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

function formatTraceDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function claimKindLabel(value: string): string {
  if (value === "question") return "Open question";
  if (value === "context_update") return "Update";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function postureLabel(value: string): string {
  if (value === "assert") return "Strong";
  if (value === "flag") return "Needs a check";
  return "Uncertain";
}

function manifestText(
  value: Record<string, unknown>,
  key: string
): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function manifestKey(value: Record<string, unknown>, index: number): string {
  return manifestText(value, "id") ?? `source-${index}`;
}
