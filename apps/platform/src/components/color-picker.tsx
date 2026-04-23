"use client";

import { FieldBadge } from "./field-badge";

export const BADGE_COLORS = [
  "badge-1",
  "badge-2",
  "badge-3",
  "badge-4",
  "badge-5",
  "badge-6",
];

const COLOR_LABELS: Record<string, string> = {
  "badge-1": "Slate",
  "badge-2": "Olive",
  "badge-3": "Sage",
  "badge-4": "Ocean",
  "badge-5": "Plum",
  "badge-6": "Rose",
};

interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BADGE_COLORS.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={COLOR_LABELS[c] ?? c}
            className={[
              "rounded-md border px-1.5 py-1 transition-colors",
              active
                ? "border-accent bg-bg-selected"
                : "border-border bg-bg-card hover:border-border-strong",
            ].join(" ")}
          >
            <FieldBadge name={COLOR_LABELS[c] ?? c} color={c} />
          </button>
        );
      })}
    </div>
  );
}
