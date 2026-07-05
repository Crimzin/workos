import type { FocusItemAnchorStatus, FocusItemType } from "./types";
import type { FocusWindow } from "./focus-windows";

export interface FocusCandidateThread {
  id: string;
  title: string;
  updated_at: string;
}

export interface FocusDraftItem {
  title: string;
  body: string;
  itemType: FocusItemType;
  anchorStatus: FocusItemAnchorStatus;
  threadIds: string[];
}

export interface FocusBriefingDraft {
  body: string;
  items: FocusDraftItem[];
}

function greetingFor(window: Pick<FocusWindow, "mode">): string {
  if (window.mode === "weekly") {
    return "Happy Monday. Ready for another big week?";
  }
  if (window.mode === "midday") {
    return "Let's repair the day.";
  }
  if (window.mode === "end_of_day") {
    return "Let's close the day cleanly.";
  }
  if (window.mode === "friday_reflection") {
    return "Friday check-in. Let's land the week.";
  }
  return "Good morning. Let's pick the next useful move.";
}

export function buildFocusBriefingDraft({
  window,
  actorName,
  candidateThreads,
}: {
  window: FocusWindow;
  actorName: string;
  candidateThreads: FocusCandidateThread[];
}): FocusBriefingDraft {
  const topThreads = [...candidateThreads]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);

  if (topThreads.length === 0) {
    return {
      body: `${greetingFor(window)}\n\n${actorName}, I do not have enough active threads to draft a grounded Focus plan yet. Want me to create a starter thread for the most important thing you are trying to move forward?`,
      items: [
        {
          title: "Create a starter Focus thread",
          body: "Focus needs a thread anchor before it can turn this into a real next move.",
          itemType: "planning_question",
          anchorStatus: "needs_thread",
          threadIds: [],
        },
      ],
    };
  }

  const lines = topThreads.map(
    (thread, index) => `${index + 1}. ${thread.title}`
  );
  return {
    body: `${greetingFor(window)}\n\nHere are the thread-backed priorities I can see right now:\n\n${lines.join("\n")}\n\nWould you rerank these at all? If there is one must-win for this planning window, what should it be?`,
    items: topThreads.map((thread) => ({
      title: thread.title,
      body: "Focus thinks this thread deserves attention in the current planning window.",
      itemType: "priority",
      anchorStatus: "anchored",
      threadIds: [thread.id],
    })),
  };
}
