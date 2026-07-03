"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Eye,
  EyeOff,
  Lightbulb,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  archiveNode,
  deleteNode,
  hideImportedChat,
  setImportedChatSuggestionStatus,
  showImportedChat,
  unarchiveNode,
} from "@/lib/actions/nodes";
import type { ImportedChatRow } from "@/lib/imported-chats";
import { sourceAppLabel } from "@/lib/post-source-links";
import { ConfirmModal } from "../confirm-modal";
import { SourceChip } from "../source-chip";

interface SourcesSettingsProps {
  importedChats: ImportedChatRow[];
}

type SourceFilter = "all" | ImportedChatRow["source_app"];

export function SourcesSettings({ importedChats }: SourcesSettingsProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<ImportedChatRow | null>(null);
  const [, startTransition] = useTransition();

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(importedChats.map((chat) => chat.source_app))).sort();
  }, [importedChats]);

  const filteredChats = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return importedChats.filter((chat) => {
      if (sourceFilter !== "all" && chat.source_app !== sourceFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        chat.title,
        chat.source_title,
        chat.source_conversation_id,
        sourceAppLabel(chat.source_app),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase().includes(normalizedQuery)
        );
    });
  }, [importedChats, query, sourceFilter]);

  const runAction = (action: () => Promise<void>) => {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Sources</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Manage imported chats and context suggestions.
          </p>
        </div>
        <Link
          href="/import"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Upload size={15} />
          Import
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search sources</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search imports"
            className="h-9 w-full rounded-md border border-border bg-bg-card pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label>
          <span className="sr-only">Filter source app</span>
          <select
            value={sourceFilter}
            onChange={(event) =>
              setSourceFilter(event.target.value as SourceFilter)
            }
            className="h-9 rounded-md border border-border bg-bg-card px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All apps</option>
            {sourceOptions.map((sourceApp) => (
              <option key={sourceApp} value={sourceApp}>
                {sourceAppLabel(sourceApp)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-bg-card">
        {filteredChats.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredChats.map((chat) => (
              <SourceRow
                key={chat.id}
                chat={chat}
                onShowInRail={() =>
                  runAction(async () => {
                    await showImportedChat(chat.id);
                  })
                }
                onHideFromRail={() =>
                  runAction(async () => {
                    await hideImportedChat(chat.id);
                  })
                }
                onToggleSuggestions={() =>
                  runAction(async () => {
                    await setImportedChatSuggestionStatus(
                      chat.id,
                      chat.suggestion_status === "ignored"
                        ? "allowed"
                        : "ignored"
                    );
                  })
                }
                onArchive={() =>
                  runAction(async () => {
                    await archiveNode(chat.id, chat.id, chat.parent_id);
                  })
                }
                onUnarchive={() =>
                  runAction(async () => {
                    await unarchiveNode(chat.id, chat.id, chat.parent_id);
                  })
                }
                onDelete={() => setDeleteTarget(chat)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-text-tertiary">
            No imported chats found.
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete imported chat?"
          body={`This permanently deletes "${deleteTarget.title}".`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            runAction(async () => {
              await deleteNode(target.id, target.id, target.parent_id);
            });
          }}
        />
      )}
    </section>
  );
}

function SourceRow({
  chat,
  onShowInRail,
  onHideFromRail,
  onToggleSuggestions,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  chat: ImportedChatRow;
  onShowInRail: () => void;
  onHideFromRail: () => void;
  onToggleSuggestions: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const hidden = chat.imported_visibility === "hidden_from_imported_chats";
  const ignored = chat.suggestion_status === "ignored";
  const archived = Boolean(chat.archived_at);
  const railLabel = archived ? "Archived" : hidden ? "Hidden" : "In rail";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <Link
          href={`/n/${chat.id}`}
          className="block truncate text-sm font-medium text-text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {chat.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          <SourceChip sourceApp={chat.source_app} />
          <StatusPill label={railLabel} />
          <StatusPill label={ignored ? "Ignored" : "Allowed"} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <IconAction href={`/n/${chat.id}`} label="Open">
          <Eye size={14} />
        </IconAction>
        {archived ? null : hidden ? (
          <IconAction label="Show in rail" onClick={onShowInRail}>
            <Eye size={14} />
          </IconAction>
        ) : (
          <IconAction label="Hide from rail" onClick={onHideFromRail}>
            <EyeOff size={14} />
          </IconAction>
        )}
        <IconAction
          label={ignored ? "Allow suggestions" : "Ignore suggestions"}
          onClick={onToggleSuggestions}
        >
          <Lightbulb size={14} />
        </IconAction>
        {archived ? (
          <IconAction label="Unarchive" onClick={onUnarchive}>
            <Archive size={14} />
          </IconAction>
        ) : (
          <IconAction label="Archive" onClick={onArchive}>
            <Archive size={14} />
          </IconAction>
        )}
        <IconAction label="Delete" onClick={onDelete} tone="danger">
          <Trash2 size={14} />
        </IconAction>
      </div>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-tertiary">
      {label}
    </span>
  );
}

function IconAction({
  children,
  href,
  label,
  onClick,
  tone = "neutral",
}: {
  children: ReactNode;
  href?: string;
  label: string;
  onClick?: () => void;
  tone?: "neutral" | "danger";
}) {
  const className = [
    "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
    tone === "danger"
      ? "text-red-500 hover:bg-red-500/10"
      : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary",
  ].join(" ");

  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}
