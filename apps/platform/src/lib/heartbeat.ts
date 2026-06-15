type Env = Record<string, string | undefined>;

export type CronAuthorizationStatus =
  | "allowed-local"
  | "authorized"
  | "misconfigured"
  | "unauthorized";

export function getCronAuthorizationStatus(
  authorizationHeader: string | null,
  env: Env = process.env
): CronAuthorizationStatus {
  const secret = env.CRON_SECRET?.trim();

  if (!secret) {
    return env.VERCEL_ENV ? "misconfigured" : "allowed-local";
  }

  return authorizationHeader === `Bearer ${secret}`
    ? "authorized"
    : "unauthorized";
}
