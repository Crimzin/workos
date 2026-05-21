"use client";

import { useEffect, useRef, useState, useTransition } from "react";

interface InlineCreateProps {
  /** Button label shown when collapsed. */
  label: string;
  /** Input placeholder when expanded. */
  placeholder?: string;
  /** Called on submit. Return the created node's id if you want onCreated to run. */
  onSubmit: (title: string) => Promise<{ id: string } | void>;
  /** Called after a successful submit. */
  onCreated?: (id: string) => void;
  /** Called when the input is cancelled with Escape or blur-empty. */
  onCancel?: () => void;
  /** Optional icon for the collapsed state. */
  icon?: React.ReactNode;
  /** Tailwind override for the collapsed button. */
  buttonClassName?: string;
  /** Tailwind override for the expanded input. */
  inputClassName?: string;
  /** Auto-focus the input on mount. Defaults to true. */
  autoFocus?: boolean;
  /** Start expanded immediately instead of rendering the collapsed button first. */
  initialExpanded?: boolean;
}

/**
 * Inline "+ X" affordance that swaps into a text input. Enter submits,
 * Escape/blur-empty cancels. Server action is wrapped in a transition so the
 * cache revalidation can stream new data back without blocking the UI.
 */
export function InlineCreate({
  label,
  placeholder,
  onSubmit,
  onCreated,
  onCancel,
  icon,
  buttonClassName,
  inputClassName,
  autoFocus = true,
  initialExpanded = false,
}: InlineCreateProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && autoFocus) inputRef.current?.focus();
  }, [expanded, autoFocus]);

  const cancel = () => {
    setExpanded(false);
    setValue("");
    onCancel?.();
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(trimmed);
      setValue("");
      setExpanded(false);
      if (result?.id && onCreated) onCreated(result.id);
    });
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={
          buttonClassName ??
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-text-tertiary hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover transition-colors"
        }
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      disabled={pending}
      placeholder={placeholder ?? label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={submit}
      className={
        inputClassName ??
        "w-full rounded-md border border-border-strong bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
      }
    />
  );
}
