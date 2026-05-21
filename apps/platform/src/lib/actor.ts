import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// All actors (for @mention lists)
// ---------------------------------------------------------------------------

export interface ActorForMention {
  id: string;
  name: string;
  kind: "human" | "agent";
}

function orderActorsForMentions(actors: ActorForMention[]): ActorForMention[] {
  const humans = actors.filter((a) => a.kind === "human");
  const agents = actors.filter((a) => a.kind === "agent");
  return [...humans, ...agents];
}

/** Returns all actors in the instance, humans first then agents, alphabetical. */
export async function getActors(instanceId?: string): Promise<ActorForMention[]> {
  let query = supabase
    .from("actors")
    .select("id, name, kind")
    .order("kind", { ascending: true }) // "agent" < "human" alphabetically → humans first
    .order("name", { ascending: true });

  if (instanceId) {
    query = query.eq("instance_id", instanceId);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Swap so humans come before agents.
  return orderActorsForMentions((data ?? []) as ActorForMention[]);
}

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
