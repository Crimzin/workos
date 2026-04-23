import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";

export interface CurrentActor {
  id: string;
  instance_id: string;
  name: string;
}

/**
 * Solo-mode placeholder. Returns the first human actor in the only instance.
 * When auth lands, swap this for a Supabase Auth → actor lookup.
 */
export async function getCurrentActor(): Promise<CurrentActor> {
  return cachedGetCurrentActor();
}

const cachedGetCurrentActor = unstable_cache(
  async (): Promise<CurrentActor> => {
    const { data, error } = await supabase
      .from("actors")
      .select("id, instance_id, name")
      .eq("kind", "human")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        "No human actor found. Did migration 0002 run and seed correctly?"
      );
    }
    return data;
  },
  ["current-actor"],
  { tags: ["current-actor"], revalidate: 3600 }
);
