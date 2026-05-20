"use client";

import { useEffect, useRef, useState } from "react";
import {
  DETAIL_PANEL_DEFAULT_WIDTH,
  DETAIL_PANEL_DIVIDER_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  DETAIL_PANEL_SNAP_THRESHOLD,
  clampDetailPanelWidth,
  detailPanelWidthFromPointer,
  getDetailPanelMaxWidth,
  snapDetailPanelWidth,
} from "@/lib/panel-resize";

const STORAGE_KEY = "workos:panel:detail-width";

export function ResizablePanelGroup({
  board,
  detail,
}: {
  board: React.ReactNode;
  detail: React.ReactNode;
}) {
  const [detailWidth, setDetailWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH);
  const widthRef = useRef(DETAIL_PANEL_DEFAULT_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const maxedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n >= DETAIL_PANEL_MIN_WIDTH) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetailWidth(n);
        widthRef.current = n;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const maxWidth = getDetailPanelMaxWidth(entry.contentRect.width);
      const shouldTrackMax =
        maxedRef.current ||
        widthRef.current >= maxWidth - DETAIL_PANEL_SNAP_THRESHOLD;
      const next = clampDetailPanelWidth(
        shouldTrackMax ? maxWidth : widthRef.current,
        entry.contentRect.width
      );
      maxedRef.current = shouldTrackMax;
      if (next === widthRef.current) return;
      widthRef.current = next;
      setDetailWidth(next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    resizing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizing.current || !containerRef.current) return;
    maxedRef.current = false;
    const rect = containerRef.current.getBoundingClientRect();
    const newWidth = detailPanelWidthFromPointer({
      containerLeft: rect.left,
      containerRight: rect.right,
      pointerX: e.clientX,
    });
    widthRef.current = newWidth;
    setDetailWidth(newWidth);
  }

  function onPointerUp() {
    if (!resizing.current) return;
    resizing.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const snapped = snapDetailPanelWidth(widthRef.current, rect.width);
      widthRef.current = snapped;
      maxedRef.current = snapped === getDetailPanelMaxWidth(rect.width);
      setDetailWidth(snapped);
    }
    localStorage.setItem(STORAGE_KEY, String(widthRef.current));
  }

  function resetDetailWidth() {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = clampDetailPanelWidth(DETAIL_PANEL_DEFAULT_WIDTH, rect.width);
    widthRef.current = next;
    maxedRef.current = false;
    setDetailWidth(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="min-w-0 flex-1 overflow-hidden">{board}</div>
      {detail && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuemin={DETAIL_PANEL_MIN_WIDTH}
            aria-valuenow={detailWidth}
            className="relative z-20 shrink-0 cursor-col-resize select-none bg-border hover:bg-accent/40 active:bg-accent/60 transition-colors"
            style={{ width: DETAIL_PANEL_DIVIDER_WIDTH }}
            onPointerDown={onDividerPointerDown}
            onDoubleClick={resetDetailWidth}
          />
          <div className="relative z-20 shrink-0 overflow-hidden bg-bg-primary" style={{ width: detailWidth }}>
            {detail}
          </div>
        </>
      )}
    </div>
  );
}
