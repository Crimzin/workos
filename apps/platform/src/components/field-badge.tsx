interface FieldBadgeProps {
  name: string;
  color: string;
}

export function FieldBadge({ name, color }: FieldBadgeProps) {
  return (
    <span
      className={`badge badge-${colorToBadgeIndex(color)} px-1.5 py-0.5 text-[10px]`}
    >
      {name}
    </span>
  );
}

function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
