import { SourcesSettings } from "@/components/settings/sources-settings";
import { getCurrentActor } from "@/lib/actor";
import { getImportedChatsForSettings } from "@/lib/imported-chats";

export default async function SourcesSettingsPage() {
  const actor = await getCurrentActor();
  const importedChats = await getImportedChatsForSettings(actor.instance_id);

  return <SourcesSettings importedChats={importedChats} />;
}
