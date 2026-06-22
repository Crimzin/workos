export const DEFAULT_WORKOS_TIME_ZONE = "America/New_York";

interface FormatAbsoluteDateTimeOptions {
  timeZone?: string;
}

export interface WorkOSClock {
  instant: Date;
  iso: string;
  timeZone: string;
  label: string;
}

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function parseDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function getWorkOSNow(timeZone = DEFAULT_WORKOS_TIME_ZONE): WorkOSClock {
  const instant = new Date();

  return {
    instant,
    iso: instant.toISOString(),
    timeZone,
    label: formatAbsoluteDateTime(instant, { timeZone }),
  };
}

export function formatAbsoluteDateTime(
  value: Date | string,
  options: FormatAbsoluteDateTimeOptions = {}
): string {
  const date = parseDate(value);

  if (!date) {
    return String(value);
  }

  const timeZone = options.timeZone ?? DEFAULT_WORKOS_TIME_ZONE;
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${formatter.format(date)} ${timeZone}`;
}

export function formatTemporalContext(
  now: Date = getWorkOSNow().instant,
  timeZone = DEFAULT_WORKOS_TIME_ZONE
): string {
  return `Current WorkOS time: ${formatAbsoluteDateTime(now, { timeZone })}.`;
}

export function formatRelativeAge(
  value: Date | string,
  now = getWorkOSNow().instant
): string {
  const date = parseDate(value);

  if (!date) {
    return String(value);
  }

  const elapsedMs = now.getTime() - date.getTime();
  const absoluteElapsedMs = Math.abs(elapsedMs);
  const suffix = elapsedMs < 0 ? "" : " ago";
  const prefix = elapsedMs < 0 ? "in " : "";

  if (absoluteElapsedMs < MS_PER_MINUTE) {
    if (elapsedMs < 0) {
      return "in <1m";
    }

    return "just now";
  }

  if (absoluteElapsedMs < MS_PER_HOUR) {
    return `${prefix}${Math.floor(absoluteElapsedMs / MS_PER_MINUTE)}m${suffix}`;
  }

  if (absoluteElapsedMs < MS_PER_DAY) {
    return `${prefix}${Math.floor(absoluteElapsedMs / MS_PER_HOUR)}h${suffix}`;
  }

  return `${prefix}${Math.floor(absoluteElapsedMs / MS_PER_DAY)}d${suffix}`;
}

export function formatPromptTimestamp(
  value: Date | string,
  now = getWorkOSNow().instant,
  timeZone = DEFAULT_WORKOS_TIME_ZONE
): string {
  return `${formatAbsoluteDateTime(value, { timeZone })} - ${formatRelativeAge(
    value,
    now
  )}`;
}

export function getElapsedGapLabel(
  previousValue: Date | string,
  nextValue: Date | string
): string | null {
  const previousDate = parseDate(previousValue);
  const nextDate = parseDate(nextValue);

  if (!previousDate || !nextDate) {
    return null;
  }

  const elapsedDays = Math.floor(
    (nextDate.getTime() - previousDate.getTime()) / MS_PER_DAY
  );

  if (elapsedDays < 2) {
    return null;
  }

  const dayLabel = elapsedDays === 1 ? "day" : "days";
  return `${elapsedDays} ${dayLabel} pass`;
}
