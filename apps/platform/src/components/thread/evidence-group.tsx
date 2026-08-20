import { ExternalLink } from "lucide-react";
import { sourceThreadHref } from "@/lib/post-source-links";
import type { WorkingModelEvidenceGroup } from "@/lib/working-model";
import { SourceChip } from "../source-chip";

interface EvidenceGroupProps {
  group: WorkingModelEvidenceGroup;
}

export function EvidenceGroup({ group }: EvidenceGroupProps) {
  return (
    <details className="rounded-md border border-border bg-bg-primary">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="flex min-w-0 items-center gap-2">
          <SourceChip sourceApp={group.sourceApp} />
          <span className="truncate">{group.sourceLabel}</span>
        </span>
        <span className="shrink-0 text-text-tertiary">{group.count}</span>
      </summary>
      <div className="space-y-2 border-t border-border px-2.5 py-2">
        {group.items.map((item) => {
          const content = (
            <>
              <div className="text-[11px] font-medium capitalize text-text-secondary">
                {item.relation.replace(/_/g, " ")}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                {item.excerpt ?? "The source reference is retained, but its text is unavailable."}
              </p>
            </>
          );
          return item.sourceNodeId ? (
            <a
              key={item.id}
              href={sourceThreadHref(item.sourceNodeId, item.sourcePostId)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md px-2 py-1.5 transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="flex items-start justify-between gap-2">
                <span>{content}</span>
                <ExternalLink size={11} className="mt-0.5 shrink-0 text-text-tertiary" />
              </span>
            </a>
          ) : (
            <div key={item.id} className="rounded-md px-2 py-1.5">
              {content}
            </div>
          );
        })}
      </div>
    </details>
  );
}
