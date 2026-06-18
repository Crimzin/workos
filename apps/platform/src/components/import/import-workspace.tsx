"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { materializeImportPreview } from "@/lib/actions/imports";
import {
  renderStartingContextMarkdown,
  validateImportPreview,
  type ImportPreview,
} from "@/lib/import-preview";

export function ImportWorkspace() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const includedCount = useMemo(
    () => preview?.clusters.filter((cluster) => cluster.include).length ?? 0,
    [preview]
  );

  function parsePreview() {
    try {
      setError(null);
      setPreview(validateImportPreview(JSON.parse(raw)));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Invalid import preview JSON");
    }
  }

  function toggleCluster(clusterId: string) {
    setPreview((current) => {
      if (!current) return current;
      const clusters = current.clusters.map((cluster) =>
        cluster.id === clusterId
          ? { ...cluster, include: !cluster.include }
          : cluster
      );
      return {
        ...current,
        clusters,
        excluded_cluster_ids: clusters
          .filter((cluster) => !cluster.include)
          .map((cluster) => cluster.id),
      };
    });
  }

  function submit() {
    if (!preview) return;
    startTransition(async () => {
      const result = await materializeImportPreview(preview);
      router.push(`/n/${result.workspaceId}`);
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary text-text-primary">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Import</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Bring in AI history
        </h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="min-h-0 border-b border-border p-5 md:border-b-0 md:border-r">
          <label className="block text-sm font-medium" htmlFor="import-preview-json">
            Preview JSON
          </label>
          <textarea
            id="import-preview-json"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            className="mt-2 h-80 w-full resize-none rounded-md border border-border bg-bg-card p-3 font-mono text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent"
            placeholder="Paste the import preview response."
          />
          {error ? (
            <p className="mt-2 text-sm text-[var(--status-blocked)]">{error}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={parsePreview}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!preview || includedCount === 0 || pending}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Importing..." : `Import ${includedCount}`}
            </button>
          </div>
        </section>

        <section className="min-h-0 overflow-auto p-5">
          {!preview ? (
            <div className="text-sm text-text-secondary">
              Paste a preview payload to review topic clusters.
            </div>
          ) : (
            <div className="space-y-3">
              {preview.clusters.map((cluster) => (
                <article
                  key={cluster.id}
                  className="rounded-md border border-border bg-bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">
                        {cluster.title}
                      </h2>
                      <p className="mt-1 text-sm text-text-secondary">
                        {cluster.summary}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={cluster.include}
                        onChange={() => toggleCluster(cluster.id)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      Include
                    </label>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-bg-primary p-3 whitespace-pre-wrap text-xs text-text-secondary">
                    {renderStartingContextMarkdown(cluster.starting_context)}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
