import { getSidebarPins, getSidebarTree } from "@/lib/nodes";
import { Sidebar } from "./sidebar";

/**
 * Shell that wraps every route: sidebar on the left, a flexible content area
 * in the middle.
 *
 * The sidebar renders the recursive node tree. Root workspace-type nodes are
 * shown as user-facing projects; children render nested beneath them.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const projectTree = await getSidebarTree();
  const pinnedNodes = await getSidebarPins(projectTree);

  return (
    <div className="flex h-dvh w-full bg-bg-primary text-text-primary">
      <Sidebar projectTree={projectTree} pinnedNodes={pinnedNodes} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
