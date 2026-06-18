"use client";

import { ClusterReviewSurface } from "./cluster-review-surface";
import { LegacyImportJsonPanel } from "./legacy-import-json-panel";

export function ImportWorkspace() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ClusterReviewSurface />
      </div>
      <LegacyImportJsonPanel />
    </div>
  );
}
