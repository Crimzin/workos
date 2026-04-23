import { Sparkles } from "lucide-react";

export function AIPanelPlaceholder() {
  return (
    <div
      className="shrink-0 border-t border-border bg-bg-secondary px-4 py-2.5 flex items-center gap-2"
      aria-label="AI panel (coming soon)"
    >
      <Sparkles
        size={14}
        strokeWidth={2}
        className="text-agent-accent"
      />
      <span className="text-xs text-text-tertiary">
        AI features coming in the next update
      </span>
    </div>
  );
}
