import { ImportSessionWorkspace } from "@/components/import/import-session-workspace";

export default function ImportPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Sources</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          Import Chats
        </h1>
      </div>
      <ImportSessionWorkspace />
    </div>
  );
}
