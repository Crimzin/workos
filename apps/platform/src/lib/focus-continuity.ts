import type { FocusSessionMode } from "./types";
import type { FocusWindow } from "./focus-windows";

export interface ActiveFocusSessionSummary {
  id: string;
  windowKey: string;
  mode: FocusSessionMode;
  lastMessageAt: string | null;
}

export interface FocusContinuityTriggers {
  userRequestedReplan?: boolean;
  materialCalendarChange?: boolean;
  focusBlockChanged?: boolean;
  criticalItemChanged?: boolean;
  criticalThreadChanged?: boolean;
  sourceContextChanged?: boolean;
  meaningfulAbsence?: boolean;
}

export type FocusBriefingAction = "resume" | "add_briefing";

export type FocusBriefingReason =
  | "current_session_valid"
  | "no_active_session"
  | "planning_window_changed"
  | "user_requested_replan"
  | "material_calendar_change"
  | "focus_block_changed"
  | "critical_item_changed"
  | "critical_thread_changed"
  | "source_context_changed"
  | "meaningful_absence";

export interface FocusBriefingDecision {
  action: FocusBriefingAction;
  reason: FocusBriefingReason;
}

export function decideFocusBriefingTurn({
  currentWindow,
  activeSession,
  triggers,
}: {
  currentWindow: Pick<FocusWindow, "windowKey">;
  activeSession: ActiveFocusSessionSummary | null;
  triggers: FocusContinuityTriggers;
}): FocusBriefingDecision {
  if (triggers.userRequestedReplan) {
    return { action: "add_briefing", reason: "user_requested_replan" };
  }
  if (!activeSession) {
    return { action: "add_briefing", reason: "no_active_session" };
  }
  if (activeSession.windowKey !== currentWindow.windowKey) {
    return { action: "add_briefing", reason: "planning_window_changed" };
  }
  if (triggers.materialCalendarChange) {
    return { action: "add_briefing", reason: "material_calendar_change" };
  }
  if (triggers.focusBlockChanged) {
    return { action: "add_briefing", reason: "focus_block_changed" };
  }
  if (triggers.criticalItemChanged) {
    return { action: "add_briefing", reason: "critical_item_changed" };
  }
  if (triggers.criticalThreadChanged) {
    return { action: "add_briefing", reason: "critical_thread_changed" };
  }
  if (triggers.sourceContextChanged) {
    return { action: "add_briefing", reason: "source_context_changed" };
  }
  if (triggers.meaningfulAbsence) {
    return { action: "add_briefing", reason: "meaningful_absence" };
  }

  return { action: "resume", reason: "current_session_valid" };
}
