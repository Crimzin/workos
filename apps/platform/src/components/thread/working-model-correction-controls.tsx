"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearWorkingModelOverride,
  correctWorkingModelClaim,
  excludeWorkingModelClaimHere,
} from "@/lib/actions/working-model";

interface WorkingModelCorrectionControlsProps {
  claimId: string;
  statement: string;
  threadId: string;
  workspaceId: string;
  currentOverrideId: string | null;
  disabled?: boolean;
}

export function WorkingModelCorrectionControls({
  claimId,
  statement,
  threadId,
  workspaceId,
  currentOverrideId,
  disabled = false,
}: WorkingModelCorrectionControlsProps) {
  const [editingCorrection, setEditingCorrection] = useState(false);
  const [replacementStatement, setReplacementStatement] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (disabled) {
    return (
      <p className="text-xs leading-relaxed text-text-tertiary">
        This historical belief has already changed. Its saved state remains visible above.
      </p>
    );
  }

  const submitCorrection = () => {
    setError(null);
    startTransition(async () => {
      try {
        await correctWorkingModelClaim({
          claimId,
          threadId,
          workspaceId,
          replacementStatement,
          reason,
        });
        setEditingCorrection(false);
        router.refresh();
      } catch (caught) {
        setError(actionErrorMessage(caught));
      }
    });
  };

  const changeLocalRelevance = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (currentOverrideId) {
          await clearWorkingModelOverride({
            overrideId: currentOverrideId,
            threadId,
            workspaceId,
          });
        } else {
          await excludeWorkingModelClaimHere({
            claimId,
            threadId,
            workspaceId,
            reason: "This belief is not relevant to the current thread.",
          });
        }
        router.refresh();
      } catch (caught) {
        setError(actionErrorMessage(caught));
      }
    });
  };

  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
        Correct the model
      </h4>

      {editingCorrection ? (
        <div className="space-y-2 rounded-md border border-border bg-bg-primary p-2.5">
          <p className="text-xs leading-relaxed text-text-secondary">
            This preserves the earlier belief as history. Add corrected wording, or leave it blank to retract it.
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-text-secondary">
              Corrected wording · optional
            </span>
            <textarea
              value={replacementStatement}
              onChange={(event) => setReplacementStatement(event.target.value)}
              placeholder={statement}
              rows={2}
              maxLength={1000}
              className="w-full resize-y rounded-md border border-border bg-bg-card px-2.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-text-secondary">
              What is wrong?
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={500}
              className="w-full resize-y rounded-md border border-border bg-bg-card px-2.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditingCorrection(false)}
              className="rounded-md px-2 py-1.5 text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={submitCorrection}
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-bg-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            >
              Save correction
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditingCorrection(true)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-status-blocked/40 hover:bg-status-blocked/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            This belief is wrong
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={changeLocalRelevance}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {currentOverrideId ? "Undo not relevant here" : "Not relevant here"}
          </button>
          {currentOverrideId && (
            <span className="self-center text-[11px] text-text-tertiary">Undo restores it only in this thread.</span>
          )}
        </div>
      )}

      <p aria-live="polite" className="text-xs text-status-blocked">
        {error}
      </p>
    </section>
  );
}

function actionErrorMessage(value: unknown): string {
  return value instanceof Error
    ? value.message
    : "The working model could not be updated. Please try again.";
}
