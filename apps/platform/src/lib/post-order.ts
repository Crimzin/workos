import type { PostRecord } from "./posts";

export function orderPostsForThread(posts: PostRecord[]): PostRecord[] {
  return [...posts].sort((a, b) => {
    const createdDiff = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}
