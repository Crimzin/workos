import { AccountMemorySettings } from "@/components/account-memory-settings";
import { getCurrentActor } from "@/lib/actor";
import {
  getAccountMemoryRecords,
  renderAccountMemoryMarkdown,
} from "@/lib/account-memory";

export default async function MemorySettingsPage() {
  const actor = await getCurrentActor();
  const records = await getAccountMemoryRecords(actor.instance_id);

  return (
    <AccountMemorySettings
      records={records}
      markdown={renderAccountMemoryMarkdown(records)}
    />
  );
}
