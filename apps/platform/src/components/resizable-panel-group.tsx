"use client";

import { useRef, useState } from "react";

export function ResizablePanelGroup({
  board,
  detail,
}: {
  board: React.ReactNode;
  detail: React.ReactNode;
}) {
  const [detailWidth, setDetailWidth] = useState(420);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    resizing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizing.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newWidth = Math.round(
      Math.max(280, Math.min(800, rect.right - e.clientX - 4))
    );
    setDetailWidth(newWidth);
  }

  function onPointerUp() {
    resizing.current = false;
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="min-w-0 flex-1">{board}</div>
      {detail && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            className="w-1 shrink-0 cursor-col-resize select-none bg-border hover:bg-accent/40 active:bg-accent/60 transition-colors"
            onPointerDown={onDividerPointerDown}
          />
          <div className="shrink-0 overflow-hidden" style={{ width: detailWidth }}>
            {detail}
          </div>
        </>
      )}
    </div>
  );
}
