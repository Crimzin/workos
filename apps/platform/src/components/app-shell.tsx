import { headers } from "next/headers";
import { getSidebarData } from "@/lib/nodes";
import { MobileAppShell } from "./mobile-app-shell";

/**
 * Shell that wraps every route: sidebar on the left, a flexible content area
 * in the middle.
 *
 * The sidebar renders the recursive node tree. Root workspace-type nodes are
 * shown as user-facing projects; children render nested beneath them.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-workos-pathname");
  if (pathname === "/login" || pathname === "/login/") {
    return <>{children}</>;
  }

  const sidebarData = await getSidebarData();

  return (
    <MobileAppShell sidebarData={sidebarData}>
      {children}
    </MobileAppShell>
  );
}
