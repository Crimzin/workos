import { createHmac, timingSafeEqual } from "node:crypto";

type PrivateAccessMode = "disabled" | "enabled" | "misconfigured";

interface PrivateAccessSettings {
  mode: PrivateAccessMode;
  username: string;
  password: string | null;
}

type Env = Record<string, string | undefined>;

const DEFAULT_ACCESS_USER = "will";
const BASIC_PREFIX = "Basic ";
const SESSION_VERSION = "v1";
const PUBLIC_FILE_PATTERN =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|mjs|png|svg|txt|webmanifest|webp|xml)$/i;

export const WORKOS_ACCESS_REALM = "WorkOS";
export const PRIVATE_ACCESS_COOKIE_NAME = "workos_private_access";
export const PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

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

export function isPrivateAccessPasswordValid(
  password: string,
  settings: PrivateAccessSettings
): boolean {
  if (settings.mode !== "enabled" || !settings.password) {
    return false;
  }

  return safeEqual(password, settings.password);
}

function signPrivateAccessPayload(
  payload: string,
  settings: PrivateAccessSettings
): string {
  if (settings.mode !== "enabled" || !settings.password) {
    throw new Error("private_access_not_enabled");
  }

  return createHmac("sha256", settings.password)
    .update(payload)
    .digest("base64url");
}

export function createPrivateAccessSession(
  settings: PrivateAccessSettings,
  nowMs = Date.now()
): string {
  if (settings.mode !== "enabled" || !settings.password) {
    throw new Error("private_access_not_enabled");
  }

  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const payload = [
    SESSION_VERSION,
    settings.username,
    String(issuedAtSeconds),
  ].join(".");
  const signature = signPrivateAccessPayload(payload, settings);

  return `${payload}.${signature}`;
}

export function isPrivateAccessSessionAuthorized(
  sessionCookie: string | null | undefined,
  settings: PrivateAccessSettings,
  nowMs = Date.now()
): boolean {
  if (settings.mode === "disabled") {
    return true;
  }

  if (settings.mode !== "enabled" || !settings.password || !sessionCookie) {
    return false;
  }

  const parts = sessionCookie.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [version, username, issuedAtRaw, signature] = parts;
  if (version !== SESSION_VERSION || !issuedAtRaw || !signature) {
    return false;
  }

  if (!safeEqual(username, settings.username)) {
    return false;
  }

  const issuedAtSeconds = Number(issuedAtRaw);
  if (!Number.isInteger(issuedAtSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (issuedAtSeconds > nowSeconds + 60) {
    return false;
  }

  if (nowSeconds - issuedAtSeconds > PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS) {
    return false;
  }

  const payload = [version, username, issuedAtRaw].join(".");
  const expectedSignature = signPrivateAccessPayload(payload, settings);

  return safeEqual(signature, expectedSignature);
}

export function normalizePrivateAccessNextPath(
  nextPath: string | null | undefined
): string {
  const trimmed = nextPath?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(trimmed, "https://workos.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function shouldBypassPrivateAccess(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/login/" ||
    pathname === "/api/private-access/login" ||
    pathname === "/api/private-access/login/" ||
    pathname === "/api/cron/heartbeat" ||
    pathname === "/api/cron/heartbeat/" ||
    pathname.startsWith("/_next/") ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export function privateAccessChallengeHeader(): string {
  return `Basic realm="${WORKOS_ACCESS_REALM}", charset="UTF-8"`;
}
