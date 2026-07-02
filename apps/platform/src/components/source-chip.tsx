import { sourceAppLabel, sourceAppMark } from "@/lib/post-source-links";
import type { SourceApp } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SourceChipProps {
  sourceApp: SourceApp | null | undefined;
  compact?: boolean;
  className?: string;
}

export function SourceChip({
  sourceApp,
  compact = false,
  className,
}: SourceChipProps) {
  const label = sourceAppLabel(sourceApp);

  return (
    <span
      aria-label={`Source: ${label}`}
      title={compact ? label : undefined}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-border bg-bg-card text-text-tertiary",
        compact ? "w-5 justify-center px-0" : "px-1.5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-bg-hover text-[8px] font-bold leading-none"
      >
        {sourceAppMark(sourceApp)}
      </span>
      {!compact && (
        <span className="text-[10px] font-medium leading-none">{label}</span>
      )}
    </span>
  );
}
