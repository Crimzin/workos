import { timingSafeEqual } from "node:crypto";

type PrivateAccessMode = "disabled" | "enabled" | "misconfigured";

interface PrivateAccessSettings {
  mode: PrivateAccessMode;
  username: string;
  password: string | null;
}

type Env = Record<string, string | undefined>;

const DEFAULT_ACCESS_USER = "will";
const BASIC_PREFIX = "Basic ";
const PUBLIC_FILE_PATTERN =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|mjs|png|svg|txt|webmanifest|webp|xml)$/i;

export const WORKOS_ACCESS_REALM = "WorkOS";

function cleanEnvValue(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBasicAuth(authorizationHeader: string): {
  username: string;
  password: string;
} | null {
  if (!authorizationHeader.startsWith(BASIC_PREFIX)) {
    return null;
  }

  try {
    const decoded = Buffer.from(
      authorizationHeader.slice(BASIC_PREFIX.length),
      "base64"
    ).toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function getPrivateAccessSettings(
  env: Env = process.env
): PrivateAccessSettings {
  const username = cleanEnvValue(env.WORKOS_ACCESS_USER) ?? DEFAULT_ACCESS_USER;
  const password = cleanEnvValue(env.WORKOS_ACCESS_PASSWORD);

  if (password) {
    return { mode: "enabled", username, password };
  }

  if (env.VERCEL_ENV) {
    return { mode: "misconfigured", username, password: null };
  }

  return { mode: "disabled", username, password: null };
}

export function isBasicAuthAuthorized(
  authorizationHeader: string | null,
  settings: PrivateAccessSettings
): boolean {
  if (settings.mode === "disabled") {
    return true;
  }

  if (settings.mode !== "enabled" || !authorizationHeader) {
    return false;
  }

  const credentials = decodeBasicAuth(authorizationHeader);
  if (!credentials) {
    return false;
  }

  const expectedPassword = settings.password;
  if (!expectedPassword) {
    return false;
  }

  return (
    safeEqual(credentials.username, settings.username) &&
    safeEqual(credentials.password, expectedPassword)
  );
}

export function shouldBypassPrivateAccess(pathname: string): boolean {
  return (
    pathname === "/api/cron/heartbeat" ||
    pathname === "/api/cron/heartbeat/" ||
    pathname.startsWith("/_next/") ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export function privateAccessChallengeHeader(): string {
  return `Basic realm="${WORKOS_ACCESS_REALM}", charset="UTF-8"`;
}
