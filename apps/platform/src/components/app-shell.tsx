import { getSidebarPins, getSidebarTree } from "@/lib/nodes";
import { MobileAppShell } from "./mobile-app-shell";

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
    <MobileAppShell projectTree={projectTree} pinnedNodes={pinnedNodes}>
      {children}
    </MobileAppShell>
  );
}
