"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  filterThreadPlacementCandidates,
  getExactThreadPlacementMatch,
  type ThreadPlacementCandidate,
} from "@/lib/thread-placement";

const VISIBLE_CANDIDATE_LIMIT = 8;
const CANDIDATE_POOL_LIMIT = 500;
const SERVER_SEARCH_DEBOUNCE_MS = 180;

interface ThreadPickerCreateProps {
  label: string;
  placeholder: string;
  loadCandidates: (
    query: string,
    limit?: number
  ) => Promise<ThreadPlacementCandidate[]>;
  onSelect: (threadId: string) => Promise<{ id: string } | void>;
  onCreate: (title: string) => Promise<{ id: string } | void>;
  onCreated?: (id: string) => void;
  icon?: React.ReactNode;
  buttonClassName?: string;
  inputClassName?: string;
  panelClassName?: string;
  menuAlign?: "left" | "right";
  menuClassName?: string;
}

export function ThreadPickerCreate({
  label,
  placeholder,
  loadCandidates,
  onSelect,
  onCreate,
  onCreated,
  icon,
  buttonClassName,
  inputClassName,
  panelClassName,
  menuAlign = "left",
  menuClassName,
}: ThreadPickerCreateProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidatePool, setCandidatePool] = useState<ThreadPlacementCandidate[]>([]);
  const [serverSettledQuery, setServerSettledQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRequestIdRef = useRef(0);

  const visibleCandidates = useMemo(
    () => filterThreadPlacementCandidates(candidatePool, query, VISIBLE_CANDIDATE_LIMIT),
    [candidatePool, query]
  );
  const exactMatch = getExactThreadPlacementMatch(visibleCandidates, query);
  const trimmedQuery = query.trim();
  const serverSearchPending =
    trimmedQuery.length > 0 && serverSettledQuery !== trimmedQuery;
  const showCreate =
    trimmedQuery.length > 0 && !exactMatch && !serverSearchPending;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    loadCandidates("", CANDIDATE_POOL_LIMIT).then((nextCandidates) => {
      if (!cancelled) {
        setCandidatePool((current) =>
          mergeThreadPlacementCandidates(current, nextCandidates)
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadCandidates, open]);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      queryRequestIdRef.current += 1;
      return;
    }

    const requestId = queryRequestIdRef.current + 1;
    queryRequestIdRef.current = requestId;
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      loadCandidates(trimmed, VISIBLE_CANDIDATE_LIMIT)
        .then((nextCandidates) => {
        if (!cancelled && queryRequestIdRef.current === requestId) {
          setCandidatePool((current) => mergeThreadPlacementCandidates(
            current,
            nextCandidates
          ));
          setServerSettledQuery(trimmed);
        }
      });
    }, SERVER_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loadCandidates, open, query]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setCandidatePool([]);
    setServerSettledQuery("");
  }

  function finish(result: { id: string } | void) {
    close();
    if (result?.id) onCreated?.(result.id);
  }

  function submit() {
    const trimmed = query.trim();
    const selected = exactMatch ?? (!trimmed ? visibleCandidates[0] ?? null : null);

    startTransition(async () => {
      if (selected) {
        finish(await onSelect(selected.id));
      } else if (trimmed) {
        const serverCandidates = await loadCandidates(
          trimmed,
          VISIBLE_CANDIDATE_LIMIT
        );
        const serverMatch = getExactThreadPlacementMatch(
          serverCandidates,
          trimmed
        );
        if (serverMatch) {
          finish(await onSelect(serverMatch.id));
          return;
        }
        finish(await onCreate(trimmed));
      } else {
        close();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:bg-bg-hover hover:text-text-secondary"
        }
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", panelClassName)}>
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={pending}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          className={
            inputClassName ??
            "w-full rounded-md border border-border-strong bg-bg-card py-1.5 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          }
        />
      </div>
      <div
        className={cn(
          "absolute top-full z-30 mt-1 rounded-md border border-border bg-bg-card py-1 shadow-sm",
          menuAlign === "right" ? "right-0" : "left-0",
          menuClassName ?? "w-72"
        )}
      >
        {visibleCandidates.length === 0 && !showCreate ? (
          <div className="px-3 py-2 text-xs text-text-tertiary">
            {serverSearchPending ? "Searching..." : "No matching threads."}
          </div>
        ) : (
          visibleCandidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  finish(await onSelect(candidate.id));
                });
              }}
              className="block w-full px-3 py-2 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
            >
              <span className="block truncate text-sm font-medium text-text-primary">
                {candidate.title}
              </span>
              <span className="block truncate text-xs text-text-tertiary">
                {candidate.path}
              </span>
            </button>
          ))
        )}
        {showCreate && (
          <>
            {visibleCandidates.length > 0 && (
              <div className="my-1 h-px bg-border" />
            )}
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
            >
              <Plus size={13} />
              <span className="min-w-0 truncate">
                Create &quot;{query.trim()}&quot;
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function mergeThreadPlacementCandidates(
  current: ThreadPlacementCandidate[],
  incoming: ThreadPlacementCandidate[]
): ThreadPlacementCandidate[] {
  const candidatesById = new Map(current.map((candidate) => [candidate.id, candidate]));

  for (const candidate of incoming) {
    candidatesById.set(candidate.id, candidate);
  }

  return [...candidatesById.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}
