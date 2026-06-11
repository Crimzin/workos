import type { ReactNode } from "react";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import type { NodePathItem } from "@/lib/node-path";
import type { WorkNode } from "@/lib/types";
import {
  buildThreadIdentityTrail,
  getHeaderBadges,
} from "@/lib/detail-header";
import { NodeIdentityRail } from "../node-identity-rail";

type ThreadActor = {
  id: string;
  name: string;
  kind: string;
};

export interface ThreadHeaderProps {
  node: WorkNode;
  path: NodePathItem[];
  fields: DetailField[];
  values: DetailFieldValue[];
  owner: ThreadActor | null;
  members: ThreadActor[];
  workspaceId: string;
  actions?: ReactNode;
  viewSwitcher?: ReactNode;
}

export function ThreadHeader({
  node,
  path,
  fields,
  values,
  owner,
  members,
  workspaceId,
  actions,
  viewSwitcher,
}: ThreadHeaderProps) {
  const headerBadges = getHeaderBadges(fields, values);
  const identityTrail = buildThreadIdentityTrail({ path, current: node });

  return (
    <NodeIdentityRail
      node={node}
      workspaceId={workspaceId}
      trail={identityTrail}
      badges={headerBadges}
      owner={owner}
      members={members}
      actions={actions}
      viewSwitcher={viewSwitcher}
      paddingClassName="px-6"
    />
  );
}
