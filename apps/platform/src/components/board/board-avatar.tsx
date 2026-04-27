import type { BoardActor } from "@/lib/board-types";

interface BoardAvatarProps {
  actor: BoardActor;
  size?: number;
}

export function BoardAvatar({ actor, size = 20 }: BoardAvatarProps) {
  const initials = actor.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isAgent = actor.kind === "agent";

  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };

  if (actor.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={actor.avatar_url}
        alt={actor.name}
        title={actor.name}
        style={style}
        className={[
          "shrink-0 rounded-full object-cover",
          isAgent ? "ring-1 ring-purple-500" : "ring-1 ring-border",
        ].join(" ")}
      />
    );
  }

  return (
    <span
      title={actor.name}
      style={style}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        isAgent
          ? "bg-purple-100 text-purple-700 ring-1 ring-purple-500 dark:bg-purple-900/40 dark:text-purple-300"
          : "bg-bg-hover text-text-secondary ring-1 ring-border",
      ].join(" ")}
    >
      {initials}
    </span>
  );
}
