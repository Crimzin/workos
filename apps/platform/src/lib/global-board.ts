import type { WorkNode } from "./types";

export function chooseGlobalBoardRoot(roots: WorkNode[]): WorkNode | null {
  return (
    roots.find(
      (node) => node.type === "workspace" && node.source_kind !== "imported_ai_chat"
    ) ?? null
  );
}

export async function getGlobalBoardData() {
  const [{ getWorkspaceBoard }, { getRootNodes }, { getWorkspaceViews }] =
    await Promise.all([
      import("./board"),
      import("./nodes"),
      import("./views"),
    ]);
  const roots = await getRootNodes();
  const root = chooseGlobalBoardRoot(roots);
  if (!root) return null;

  const [board, views] = await Promise.all([
    getWorkspaceBoard(root.id),
    getWorkspaceViews(root.id),
  ]);
  if (!board) return null;

  return { board, root, views };
}
