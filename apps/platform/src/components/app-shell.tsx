import { getRootNodes } from "@/lib/nodes";
import { Sidebar } from "./sidebar";
import { AIPanelPlaceholder } from "./ai-panel-placeholder";

/**
 * Shell that wraps every route: sidebar on the left, a flexible content area
 * in the middle, and a collapsed AI panel bar at the bottom.
 *
 * Personal workspace is identified as the lowest-position root workspace.
 * This matches the seed and the design-spec convention that the personal
 * workspace is auto-created first per user.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const roots = await getRootNodes();
  const personal = roots[0] ?? null;
  const workspaces = roots.slice(1);

  return (
    <div className="flex h-dvh w-full">
      <Sidebar personal={personal} workspaces={workspaces} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto">{children}</main>
        <AIPanelPlaceholder />
      </div>
    </div>
  );
}
