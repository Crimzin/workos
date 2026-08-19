"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  completeAISourceImport,
  failAISourceImport,
  importAISourceConversationBatch,
  startAISourceImport,
} from "@/lib/actions/import-sources";
import {
  buildImportConversationBatches,
  classifyImportConversations,
  type ImportedConversationManifestEntry,
} from "@/lib/import-batches";
import { planImportFileSelection } from "@/lib/import-file-selection";
import {
  inspectImportFiles,
  normalizeInspectedConversations,
  type RawImportFile,
} from "@/lib/import-sources";

interface QueuedImportFile extends RawImportFile {
  byteSize: number;
}

export interface ImportSessionWorkspaceProps {
  existingConversations: ImportedConversationManifestEntry[];
}

export function ImportSessionWorkspace({
  existingConversations,
}: ImportSessionWorkspaceProps) {
  const [files, setFiles] = useState<QueuedImportFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [importStage, setImportStage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const router = useRouter();
  const inspection = useMemo(() => inspectImportFiles(files), [files]);
  const classification = useMemo(
    () =>
      classifyImportConversations(
        inspection.conversations,
        existingConversations
      ),
    [existingConversations, inspection.conversations]
  );
  const queuedByteCount = useMemo(
    () => files.reduce((sum, file) => sum + file.byteSize, 0),
    [files]
  );
  const isSubmitting = submitting || pending;
  const readableCount = inspection.inventory.reduce(
    (sum, item) => sum + item.conversationCount,
    0
  );
  const pendingCount = classification.pending.length;

  async function readFiles(fileList: FileList | null) {
    if (!fileList || submittingRef.current) return;
    const selectedFiles = Array.from(fileList);
    const plan = planImportFileSelection({
      candidates: selectedFiles,
      currentByteCount: queuedByteCount,
      currentFileCount: files.length,
    });

    setError(plan.errors.length > 0 ? plan.errors.join(" ") : null);
    if (plan.accepted.length === 0) return;

    try {
      const next: QueuedImportFile[] = [];
      for (const item of plan.accepted) {
        next.push({
          fileName: item.fileName,
          text: await item.file.text(),
          byteSize: item.byteSize,
        });
      }
      setFiles((current) => [...current, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file.");
    }
  }

  function runImport() {
    if (submittingRef.current || pendingCount === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setImportStage(`Preparing ${pendingCount} chats for import.`);
    setError(null);
    startTransition(async () => {
      let importSessionId: string | null = null;
      try {
        const conversations = normalizeInspectedConversations(
          classification.pending
        );
        const batches = buildImportConversationBatches(conversations);
        const sourceApps = [
          ...new Set(
            inspection.conversations.map((conversation) => conversation.sourceApp)
          ),
        ];
        const started = await startAISourceImport({
          inventory: inspection.inventory,
          sourceApps,
          summary: {
            newCount: classification.fresh.length,
            updatedCount: classification.updated.length,
            unchangedCount: classification.unchanged.length,
          },
        });
        importSessionId = started.importSessionId;

        for (let index = 0; index < batches.length; index += 1) {
          setImportStage(
            `Writing batch ${index + 1} of ${batches.length}. Keep this tab open.`
          );
          await importAISourceConversationBatch({
            importSessionId,
            conversations: batches[index],
          });
        }

        await completeAISourceImport({ importSessionId });
        setImportStage("Import complete. Opening WorkOS...");
        router.push("/");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed.";
        if (importSessionId) {
          try {
            await failAISourceImport({ importSessionId, message });
          } catch {
            // Preserve the original import error for the user.
          }
        }
        setError(message);
        setImportStage(null);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    });
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto px-6 py-6"
      aria-busy={isSubmitting}
    >
      <div className="max-w-2xl">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          multiple
          disabled={isSubmitting}
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            void readFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept=".json,application/json"
          multiple
          disabled={isSubmitting}
          tabIndex={-1}
          className="sr-only"
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(event) => {
            void readFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <div className="rounded-lg border border-dashed border-border-strong bg-bg-card px-6 py-8 text-center">
          <Upload size={22} className="mx-auto text-text-tertiary" />
          <div className="mt-3 text-sm font-medium text-text-primary">
            Add Claude and ChatGPT exports
          </div>
          <div className="mt-1 text-sm text-text-secondary">
            Drop in conversation files or export folders.
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-bg-primary px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add files
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add folder
            </button>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
              Import inventory
            </div>
            <div className="divide-y divide-border">
              {inspection.inventory.map((item, index) => (
                <div
                  key={`${item.fileName}-${index}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text-primary">
                      {item.fileName}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {item.error ??
                        `${item.sourceApp} · ${item.conversationCount} chats`}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.fileName}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      setError(null);
                      setFiles((current) => current.filter((_, i) => i !== index));
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            {readableCount > 0 && (
              <div className="border-t border-border px-4 py-3 text-xs text-text-secondary">
                {classification.fresh.length} new · {classification.updated.length}{" "}
                updated · {classification.unchanged.length} already imported
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-status-blocked">{error}</p>}
        {isSubmitting && importStage && (
          <div className="mt-3 rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-secondary">
            {importStage}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={isSubmitting || pendingCount === 0}
            onClick={runImport}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? "Importing..."
              : pendingCount > 0
                ? `Import ${pendingCount} chats`
                : readableCount > 0
                  ? "Nothing new to import"
                  : "Import 0 chats"}
          </button>
        </div>
      </div>
    </div>
  );
}
