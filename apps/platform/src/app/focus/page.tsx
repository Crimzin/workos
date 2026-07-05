import { FocusSurface } from "@/components/focus/focus-surface";
import { getCurrentActor } from "@/lib/actor";
import { getFocusHomeData } from "@/lib/focus";

export default async function FocusPage() {
  const actor = await getCurrentActor();
  const data = await getFocusHomeData({
    instanceId: actor.instance_id,
    actorId: actor.id,
    actorName: actor.name,
  });

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary">
      <FocusSurface
        session={data.session}
        messages={data.messages}
        items={data.items}
      />
    </main>
  );
}
