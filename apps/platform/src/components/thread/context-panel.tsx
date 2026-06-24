import type { ReactNode } from "react";
import { sourceAppLabel, sourceThreadHref } from "@/lib/post-source-links";
import type { ThreadContextAttachmentWithSource } from "@/lib/thread-surface";

interface ContextPanelProps {
  attachments: ThreadContextAttachmentWithSource[];
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent?: ReactNode;
}

export function ContextPanel({
  attachments,
  fieldsContent,
  memoryContent,
  treeContent,
}: ContextPanelProps) {
  const activeAttachments = attachments.filter(
    (attachment) => attachment.status === "active"
  );

  return (
    <aside className="hidden h-full w-[360px] shrink-0 overflow-y-auto border-l border-border bg-bg-primary md:block">
      <div className="space-y-5 px-4 py-4">
        <section className="space-y-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              Context
            </div>
            <h2 className="text-sm font-semibold text-text-primary">
              Attached context
            </h2>
          </div>

          {activeAttachments.length > 0 ? (
            <div className="space-y-2">
              {activeAttachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={sourceThreadHref(
                    attachment.context_source_node_id,
                    attachment.source_post_id
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-border bg-bg-card px-3 py-2 transition-colors hover:border-border-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="truncate text-sm font-medium text-text-primary">
                    {attachment.source_node?.title ?? "Untitled context"}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
                    <span className="truncate">
                      {sourceAppLabel(attachment.source_node?.source_app)}
                    </span>
                    <span aria-hidden="true">/</span>
                    <span className="truncate">
                      {formatAttachedBy(attachment.attached_by)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-text-tertiary">
              No attached context yet.
            </div>
          )}
        </section>

        <ContextSection title="Memory">{memoryContent}</ContextSection>
        <ContextSection title="Fields">{fieldsContent}</ContextSection>
        {treeContent && <ContextSection title="Child threads">{treeContent}</ContextSection>}
      </div>
    </aside>
  );
}

function ContextSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h3>
      <div className="-mx-4 border-t border-border pt-2">{children}</div>
    </section>
  );
}

function formatAttachedBy(value: string): string {
  return value.replace(/_/g, " ");
}
