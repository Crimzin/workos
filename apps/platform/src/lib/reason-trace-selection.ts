export const REASON_TRACE_SELECTION_EVENT = "workos:reason-trace-selection";

export interface ReasonTraceSelectionDetail {
  postId: string | null;
}

export function selectReasonTrace(postId: string | null): void {
  window.dispatchEvent(
    new CustomEvent<ReasonTraceSelectionDetail>(REASON_TRACE_SELECTION_EVENT, {
      detail: { postId },
    })
  );
}

export function reasonTracePostIdFromEvent(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as Partial<ReasonTraceSelectionDetail> | null;
  return typeof detail?.postId === "string" ? detail.postId : null;
}
