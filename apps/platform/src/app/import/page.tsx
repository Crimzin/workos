import { ImportSessionWorkspace } from "@/components/import/import-session-workspace";
import { getCurrentActor } from "@/lib/actor";
import { getImportedChatsForSettings } from "@/lib/imported-chats";

export default async function ImportPage() {
  const actor = await getCurrentActor();
  const importedChats = await getImportedChatsForSettings(actor.instance_id);
  const existingConversations = importedChats.flatMap((chat) => {
    if (chat.source_app !== "claude" && chat.source_app !== "chatgpt") return [];
    const sourceConversationId = chat.source_conversation_id?.trim();
    if (!sourceConversationId) return [];
    return [{
      sourceApp: chat.source_app,
      sourceConversationId,
      sourceUpdatedAt: chat.source_updated_at,
    }];
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Sources</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          Import Chats
        </h1>
      </div>
      <ImportSessionWorkspace existingConversations={existingConversations} />
    </div>
  );
}
