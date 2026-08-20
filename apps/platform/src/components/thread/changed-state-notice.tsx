import { AlertTriangle } from "lucide-react";
import type { AnswerTraceSummary } from "@/lib/working-model";

interface ChangedStateNoticeProps {
  changedClaims: AnswerTraceSummary["changedClaims"];
  responseEdited: boolean;
}

export function ChangedStateNotice({
  changedClaims,
  responseEdited,
}: ChangedStateNoticeProps) {
  if (changedClaims.length === 0 && !responseEdited) return null;

  return (
    <details className="rounded-md border border-status-review/40 bg-status-review/5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-status-review/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-review">
        <AlertTriangle size={13} className="shrink-0 text-status-review" />
        Changed since this answer
      </summary>
      <div className="space-y-2 border-t border-status-review/30 px-3 py-2 text-xs leading-relaxed text-text-secondary">
        {responseEdited && <p>The response text was edited after this snapshot was saved.</p>}
        {changedClaims.map(({ claimId, diff }) => (
          <div key={claimId} className="space-y-1">
            <p>
              <span className="font-medium text-text-primary">Then:</span>{" "}
              {diff.previous.statement}
            </p>
            <p>
              <span className="font-medium text-text-primary">Now:</span>{" "}
              {diff.current?.statement ?? "This belief is no longer available."}
            </p>
            <p className="text-text-tertiary">
              Changed: {diff.fields.join(", ").replace(/_/g, " ")}
            </p>
            {diff.changed_at && (
              <p className="text-text-tertiary">
                When: {formatChangeDate(diff.changed_at)}
              </p>
            )}
            {diff.reason && (
              <p className="text-text-secondary">
                <span className="font-medium text-text-primary">Why:</span>{" "}
                {diff.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function formatChangeDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
