import { formatRelativeAge } from "@/lib/time";
import type { FocusMessage as FocusMessageRecord } from "@/lib/types";

interface FocusMessageProps {
  message: FocusMessageRecord;
}

export function FocusMessage({ message }: FocusMessageProps) {
  const isWorkOS = message.role === "workos";

  return (
    <article
      className={[
        "rounded-lg border px-4 py-3 text-sm leading-6",
        isWorkOS
          ? "border-border bg-bg-card text-text-primary"
          : "border-border/70 bg-bg-secondary text-text-secondary",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-text-secondary">
          {isWorkOS ? "WorkOS" : "You"}
        </div>
        <time
          dateTime={message.created_at}
          className="text-[11px] text-text-tertiary"
        >
          {formatRelativeAge(message.created_at)}
        </time>
      </div>
      <div className="whitespace-pre-wrap">{message.body}</div>
    </article>
  );
}
