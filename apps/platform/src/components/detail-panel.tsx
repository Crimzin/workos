import Link from "next/link";
import { X } from "lucide-react";
import { getNodeDetail } from "@/lib/node-detail";
import type { DetailFieldValue } from "@/lib/node-detail";
import { FieldBadge } from "./field-badge";
import { FieldRowEditor } from "./field-row-editor";
import { AddFieldButton } from "./add-field-button";

interface DetailPanelProps {
  nodeId: string;
  workspaceId: string;
  closeHref: string;
}

export async function DetailPanel({
  nodeId,
  workspaceId,
  closeHref,
}: DetailPanelProps) {
  const detail = await getNodeDetail(nodeId);

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-bg-primary">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="section-label">{detail?.node.type ?? "Detail"}</div>
        <Link
          href={closeHref}
          aria-label="Close panel"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </Link>
      </div>

      {detail ? (
        <DetailBody detail={detail} workspaceId={workspaceId} />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-text-secondary">
          Node not found.
        </div>
      )}
    </aside>
  );
}

function DetailBody({
  detail,
  workspaceId,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>;
  workspaceId: string;
}) {
  const { node, owner, fields, values } = detail;
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }

  const headerBadges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const vals = valuesByField.get(field.id) ?? [];
    for (const v of vals) {
      if (!v.option_id) continue;
      const opt = field.options.find((o) => o.id === v.option_id);
      if (opt) headerBadges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }

  return (
    <div className="flex-1 overflow-auto px-5 py-5">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">
        {node.title}
      </h2>
      {node.description && (
        <p className="mt-2 text-sm text-text-secondary">{node.description}</p>
      )}
      {headerBadges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {headerBadges.map((b) => (
            <FieldBadge key={b.id} name={b.name} color={b.color} />
          ))}
        </div>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <div className="section-label">Fields</div>
          <AddFieldButton workspaceId={workspaceId} />
        </div>
        <dl className="mt-2 divide-y divide-border rounded-md border border-border bg-bg-card">
          <SystemRow label="Owner" value={owner?.name ?? "—"} />
          <SystemRow label="Type" value={node.type} />
          <SystemRow label="Created" value={formatDate(node.created_at)} />
          <SystemRow label="Updated" value={formatDate(node.updated_at)} />
          {fields.length === 0 && (
            <div className="px-3 py-3 text-xs text-text-tertiary">
              No custom fields yet.
            </div>
          )}
          {fields.map((field) => (
            <FieldRowEditor
              key={field.id}
              field={field}
              values={valuesByField.get(field.id) ?? []}
              nodeId={node.id}
              workspaceId={workspaceId}
            />
          ))}
        </dl>
      </section>
    </div>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
