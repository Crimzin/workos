import type { FocusSessionMode } from "./types";

export interface FocusWindow {
  mode: FocusSessionMode;
  windowKey: string;
  localDate: string;
  localHour: number;
  localWeekday: number;
  timeZone: string;
}

interface LocalParts {
  date: string;
  hour: number;
  weekday: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const weekdayName = value("weekday");
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(value("hour")),
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}

export function localDateKey(date: Date, timeZone: string): string {
  return localParts(date, timeZone).date;
}

export function classifyFocusWindow(
  date: Date,
  timeZone = "America/New_York"
): FocusWindow {
  const parts = localParts(date, timeZone);
  let mode: FocusSessionMode;

  if (parts.weekday === 1 && parts.hour < 12) {
    mode = "weekly";
  } else if (parts.weekday === 5 && parts.hour >= 14) {
    mode = "friday_reflection";
  } else if (parts.hour < 12) {
    mode = "morning";
  } else if (parts.hour < 16) {
    mode = "midday";
  } else {
    mode = "end_of_day";
  }

  return {
    mode,
    windowKey: `${mode}:${parts.date}`,
    localDate: parts.date,
    localHour: parts.hour,
    localWeekday: parts.weekday,
    timeZone,
  };
}

export function focusWindowTitle(window: Pick<FocusWindow, "mode">): string {
  const titles: Record<FocusSessionMode, string> = {
    weekly: "Weekly Focus",
    morning: "Morning Focus",
    midday: "Midday Repair",
    end_of_day: "End of Day",
    friday_reflection: "Friday Reflection",
    ad_hoc: "Focus",
  };

  return titles[window.mode];
}
