import { Link2 } from "lucide-react";
import type { WorkingModelClaimView } from "@/lib/working-model";
import { EvidenceGroup } from "./evidence-group";
import { WorkingModelCorrectionControls } from "./working-model-correction-controls";

interface WorkingModelClaimCardProps {
  claim: WorkingModelClaimView;
  threadId: string;
  workspaceId: string;
}

export function WorkingModelClaimCard({
  claim,
  threadId,
  workspaceId,
}: WorkingModelClaimCardProps) {
  return (
    <details className="group/claim rounded-lg border border-border bg-bg-card transition-colors open:border-border-strong">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            {claim.kindLabel}
          </span>
          <span
            className={[
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              claim.posture === "assert"
                ? "border-status-done/30 bg-status-done/10 text-status-done"
                : claim.posture === "flag"
                  ? "border-status-review/30 bg-status-review/10 text-status-review"
                  : "border-border bg-bg-hover text-text-secondary",
            ].join(" ")}
          >
            {claim.postureLabel}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium leading-snug text-text-primary">
          {claim.statement}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
          <span>{claim.evidenceSummary}</span>
          {claim.excludedHere && (
            <span className="rounded-full bg-bg-selected px-2 py-0.5 text-text-secondary">
              Not relevant here
            </span>
          )}
        </div>
      </summary>

      <div className="space-y-4 border-t border-border px-3 py-3">
        {claim.body && (
          <p className="text-xs leading-relaxed text-text-secondary">{claim.body}</p>
        )}

        {claim.factors.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Why this posture
            </h4>
            <ul className="space-y-1.5">
              {claim.factors.map((factor, index) => (
                <li
                  key={`${factor.code}-${index}`}
                  className="flex gap-2 text-xs leading-relaxed text-text-secondary"
                >
                  <span aria-hidden="true" className="text-text-tertiary">•</span>
                  <span>{factor.explanation}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {claim.relationships.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Connected beliefs
            </h4>
            <div className="space-y-1.5">
              {claim.relationships.map((relationship) => (
                <div
                  key={relationship.id}
                  className="flex gap-2 rounded-md bg-bg-primary px-2.5 py-2 text-xs text-text-secondary"
                >
                  <Link2 size={12} className="mt-0.5 shrink-0 text-text-tertiary" />
                  <span>{relationship.statement}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {claim.evidenceGroups.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Evidence
            </h4>
            <div className="space-y-1.5">
              {claim.evidenceGroups.map((group) => (
                <EvidenceGroup key={group.key} group={group} />
              ))}
            </div>
          </section>
        )}

        <WorkingModelCorrectionControls
          claimId={claim.id}
          statement={claim.statement}
          threadId={threadId}
          workspaceId={workspaceId}
          currentOverrideId={claim.excludedHere?.id ?? null}
        />
      </div>
    </details>
  );
}
