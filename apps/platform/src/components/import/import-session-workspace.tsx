"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { importAISourceFiles } from "@/lib/actions/import-sources";
import { normalizeImportFiles, type RawImportFile } from "@/lib/import-sources";

export function ImportSessionWorkspace() {
  const [files, setFiles] = useState<RawImportFile[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const preview = useMemo(() => normalizeImportFiles(files), [files]);

  async function readFiles(fileList: FileList | null) {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    const next: RawImportFile[] = [];
    for (const file of selectedFiles) {
      next.push({ fileName: file.name, text: await file.text() });
    }
    setFiles((current) => [...current, ...next]);
  }

  function runImport() {
    setError(null);
    startTransition(async () => {
      try {
        await importAISourceFiles(files);
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  const readableCount = preview.inventory.reduce(
    (sum, item) => sum + item.conversationCount,
    0
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <div className="max-w-2xl">
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-card px-6 py-8 text-center transition-colors hover:bg-bg-hover">
          <Upload size={22} className="text-text-tertiary" />
          <span className="mt-3 text-sm font-medium text-text-primary">
            Add Claude and ChatGPT exports
          </span>
          <span className="mt-1 text-sm text-text-secondary">
            Add one or both now. You can import more whenever you need.
          </span>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(event) => {
              void readFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </label>

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
                    onClick={() =>
                      setFiles((current) => current.filter((_, i) => i !== index))
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || readableCount === 0}
            onClick={runImport}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {pending ? "Importing..." : `Import ${readableCount} chats`}
          </button>
        </div>
      </div>
    </div>
  );
}
