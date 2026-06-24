"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { importAISourceFiles } from "@/lib/actions/import-sources";
import { normalizeImportFiles, type RawImportFile } from "@/lib/import-sources";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 75 * 1024 * 1024;
const MAX_FILE_COUNT = 12;

interface QueuedImportFile extends RawImportFile {
  byteSize: number;
}

export function ImportSessionWorkspace() {
  const [files, setFiles] = useState<QueuedImportFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const router = useRouter();
  const preview = useMemo(() => normalizeImportFiles(files), [files]);
  const queuedByteCount = useMemo(
    () => files.reduce((sum, file) => sum + file.byteSize, 0),
    [files]
  );
  const isSubmitting = submitting || pending;

  async function readFiles(fileList: FileList | null) {
    if (!fileList || submittingRef.current) return;
    const selectedFiles = Array.from(fileList);
    const availableSlots = MAX_FILE_COUNT - files.length;
    const countLimitedFiles = selectedFiles.slice(0, Math.max(availableSlots, 0));
    const readableFiles: File[] = [];
    const errors = new Set<string>();
    let nextTotalBytes = queuedByteCount;

    if (selectedFiles.length > availableSlots) {
      errors.add(`Add up to ${MAX_FILE_COUNT} files at a time.`);
    }

    for (const file of countLimitedFiles) {
      if (file.size > MAX_FILE_BYTES) {
        errors.add("Each file must be 25 MB or less.");
        continue;
      }
      if (nextTotalBytes + file.size > MAX_TOTAL_BYTES) {
        errors.add("Batch limit is 75 MB.");
        continue;
      }
      readableFiles.push(file);
      nextTotalBytes += file.size;
    }

    if (errors.size > 0) setError([...errors].join(" "));
    else setError(null);
    if (readableFiles.length === 0) return;

    try {
      const next: QueuedImportFile[] = [];
      for (const file of readableFiles) {
        next.push({
          fileName: file.name,
          text: await file.text(),
          byteSize: file.size,
        });
      }
      setFiles((current) => [...current, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file.");
    }
  }

  function runImport() {
    if (submittingRef.current || readableCount === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    startTransition(async () => {
      try {
        const importFiles = files.map(({ fileName, text }) => ({ fileName, text }));
        await importAISourceFiles(importFiles);
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    });
  }

  const readableCount = preview.inventory.reduce(
    (sum, item) => sum + item.conversationCount,
    0
  );

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
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-card px-6 py-8 text-center transition-colors hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload size={22} className="text-text-tertiary" />
          <span className="mt-3 text-sm font-medium text-text-primary">
            Add Claude and ChatGPT exports
          </span>
          <span className="mt-1 text-sm text-text-secondary">
            Add one or both now. You can import more whenever you need.
          </span>
        </button>

        {files.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
              Import inventory
            </div>
            <div className="divide-y divide-border">
              {preview.inventory.map((item, index) => (
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
          </div>
        )}

        {error && <p className="mt-3 text-sm text-status-blocked">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={isSubmitting || readableCount === 0}
            onClick={runImport}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Importing..." : `Import ${readableCount} chats`}
          </button>
        </div>
      </div>
    </div>
  );
}
