import { notFound, redirect } from "next/navigation";
import { ThreadSurface } from "@/components/thread/thread-surface";
import { getNode } from "@/lib/nodes";

export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { id } = await params;
  const { d: detailId } = await searchParams;
  const node = await getNode(id);
  if (!node) notFound();

  if (detailId) {
    redirect(`/n/${detailId}`);
  }

  return <ThreadSurface nodeId={id} />;
}
