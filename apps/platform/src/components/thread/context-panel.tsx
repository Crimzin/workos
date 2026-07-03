"use client";

import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  DETAIL_PANEL_DIVIDER_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  clampDetailPanelWidth,
  detailPanelWidthFromPointer,
  snapDetailPanelWidth,
} from "@/lib/panel-resize";
import { sourceThreadHref } from "@/lib/post-source-links";
import type { ThreadContextAttachmentWithSource } from "@/lib/thread-surface";
import { SourceChip } from "../source-chip";

interface ContextPanelProps {
  attachments: ThreadContextAttachmentWithSource[];
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent?: ReactNode;
}

const WIDTH_STORAGE_KEY = "workos:panel:context-width";
const COLLAPSED_STORAGE_KEY = "workos:panel:context-collapsed";
const CONTEXT_PANEL_DEFAULT_WIDTH = 360;
const CONTEXT_PANEL_COLLAPSED_WIDTH = 44;

export function ContextPanel({
  attachments,
  fieldsContent,
  memoryContent,
  treeContent,
}: ContextPanelProps) {
  const [panelWidth, setPanelWidth] = useState(CONTEXT_PANEL_DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const panelWidthRef = useRef(CONTEXT_PANEL_DEFAULT_WIDTH);
  const panelRef = useRef<HTMLElement>(null);
  const resizingRef = useRef(false);

  useEffect(() => {
    const savedWidth = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsedWidth = savedWidth ? parseInt(savedWidth, 10) : NaN;
    const savedCollapsed =
      localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
    const frame = requestAnimationFrame(() => {
      if (!Number.isNaN(parsedWidth) && parsedWidth >= DETAIL_PANEL_MIN_WIDTH) {
        panelWidthRef.current = parsedWidth;
        setPanelWidth(parsedWidth);
      }
      setCollapsed(savedCollapsed);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const container = panelRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const next = clampDetailPanelWidth(
        panelWidthRef.current,
        entry.contentRect.width
      );
      if (next === panelWidthRef.current) return;
      panelWidthRef.current = next;
      setPanelWidth(next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const activeAttachments = attachments.filter(
    (attachment) =>
      attachment.status === "active" &&
      attachment.source_node &&
      !attachment.source_node.archived_at
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  }

  function resizePanel(event: PointerEvent<HTMLElement>) {
    if (!resizingRef.current) return;
    const rect = panelRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const next = detailPanelWidthFromPointer({
      containerLeft: rect.left,
      containerRight: rect.right,
      pointerX: event.clientX,
    });
    panelWidthRef.current = next;
    setPanelWidth(next);
  }

  function handleResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    resizingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerUp() {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    const rect = panelRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const next = snapDetailPanelWidth(panelWidthRef.current, rect.width);
    panelWidthRef.current = next;
    setPanelWidth(next);
    localStorage.setItem(WIDTH_STORAGE_KEY, String(next));
  }

  function resetPanelWidth() {
    const rect = panelRef.current?.parentElement?.getBoundingClientRect();
    const next = rect
      ? clampDetailPanelWidth(CONTEXT_PANEL_DEFAULT_WIDTH, rect.width)
      : CONTEXT_PANEL_DEFAULT_WIDTH;
    panelWidthRef.current = next;
    setPanelWidth(next);
    localStorage.setItem(WIDTH_STORAGE_KEY, String(next));
  }

  return (
    <aside
      ref={panelRef}
      className="relative hidden h-full max-h-dvh shrink-0 overflow-hidden border-l border-border bg-bg-primary md:sticky md:top-0 md:flex md:self-start"
      style={{ width: collapsed ? CONTEXT_PANEL_COLLAPSED_WIDTH : panelWidth }}
      onPointerMove={resizePanel}
      onPointerUp={handleResizePointerUp}
      onPointerCancel={handleResizePointerUp}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize context panel"
          aria-valuemin={DETAIL_PANEL_MIN_WIDTH}
          aria-valuenow={panelWidth}
          className="absolute left-0 top-0 z-20 h-full cursor-col-resize select-none bg-transparent transition-colors hover:bg-accent/30 active:bg-accent/50"
          style={{ width: DETAIL_PANEL_DIVIDER_WIDTH }}
          onPointerDown={handleResizePointerDown}
          onDoubleClick={resetPanelWidth}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={[
            "flex shrink-0 border-b border-border",
            collapsed
              ? "justify-center px-1 py-2"
              : "items-start justify-between gap-3 px-4 py-3",
          ].join(" ")}
        >
          {!collapsed && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                Context
              </div>
              <h2 className="text-sm font-semibold text-text-primary">
                Attached context
              </h2>
            </div>
          )}

          <button
            type="button"
            aria-label="Toggle context panel"
            aria-expanded={!collapsed}
            title={collapsed ? "Open context panel" : "Collapse context panel"}
            onClick={toggleCollapsed}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {collapsed ? (
              <PanelRightOpen size={15} />
            ) : (
              <PanelRightClose size={15} />
            )}
          </button>
        </div>

        {!collapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-5 px-4 py-4">
              <section className="space-y-2">
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
                          <SourceChip sourceApp={attachment.source_node?.source_app} />
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
              {treeContent && (
                <ContextSection title="Child threads">{treeContent}</ContextSection>
              )}
            </div>
          </div>
        )}
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
