"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createCard } from "@/lib/actions/nodes";
import { InlineCreate } from "./inline-create";

export function AddCardFromPanel({
  stackId,
  workspaceId,
}: {
  stackId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  return (
    <InlineCreate
      label="Add card"
      placeholder="Card title"
      icon={<Plus size={12} />}
      onSubmit={async (title) => {
        const res = await createCard(stackId, workspaceId, title);
        router.refresh();
        return res;
      }}
      buttonClassName="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-text-tertiary hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover transition-colors"
      inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}
