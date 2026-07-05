"use client";

import type { FocusItemWithThreads } from "@/lib/focus";
import type { FocusMessage, FocusSession } from "@/lib/types";
import { FocusComposer } from "./focus-composer";
import { FocusItemCard } from "./focus-item-card";
import { FocusMessage as FocusMessageView } from "./focus-message";

interface FocusSurfaceProps {
  session: FocusSession;
  messages: FocusMessage[];
  items: FocusItemWithThreads[];
}

export function FocusSurface({ session, messages, items }: FocusSurfaceProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 shrink-0">
        <div className="section-label">Home</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
          Focus
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          {session.title} stays continuous until there is a reason for WorkOS to
          chime in again.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pb-4">
        {messages.map((message) => (
          <FocusMessageView key={message.id} message={message} />
        ))}

        {items.length > 0 ? (
          <section className="space-y-2">
            <div className="section-label">Thread-backed next moves</div>
            <div className="space-y-2">
              {items.map((item) => (
                <FocusItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-bg-primary pt-3">
        <FocusComposer sessionId={session.id} />
      </div>
    </div>
  );
}
