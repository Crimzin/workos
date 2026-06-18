"use client";

import type { ReviewQuestion } from "@/lib/import-cluster-review";

export interface ClusterReviewQuestionProps {
  question: ReviewQuestion;
  onToggle: (questionId: string, enabled: boolean) => void;
}

export function ClusterReviewQuestion({
  question,
  onToggle,
}: ClusterReviewQuestionProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-border px-4 py-3 first:border-t-0 hover:bg-bg-hover">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">
          {question.label}
        </span>
        <span className="mt-0.5 block text-xs text-text-secondary">
          {question.preview}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-medium text-text-tertiary">
          {question.enabled ? "Yes" : "No"}
        </span>
        <input
          type="checkbox"
          checked={question.enabled}
          onChange={(event) => onToggle(question.id, event.target.checked)}
          className="peer sr-only"
        />
        <span
          className={[
            "relative h-5 w-9 rounded-full border border-border-strong transition-colors",
            question.enabled ? "bg-accent" : "bg-bg-secondary",
          ].join(" ")}
        >
          <span
            className={[
              "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-bg-card transition-transform",
              question.enabled ? "translate-x-4" : "",
            ].join(" ")}
          />
        </span>
      </span>
    </label>
  );
}
