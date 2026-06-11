import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS_PATH } from "@/lib/settings-nav";

export default function SettingsPage() {
  redirect(DEFAULT_SETTINGS_PATH);
}
