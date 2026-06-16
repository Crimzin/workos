import assert from "node:assert/strict";
import {
  PRIVATE_ACCESS_COOKIE_NAME,
  PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS,
  WORKOS_ACCESS_REALM,
  createPrivateAccessSession,
  getPrivateAccessSettings,
  isBasicAuthAuthorized,
  isPrivateAccessPasswordValid,
  isPrivateAccessSessionAuthorized,
  normalizePrivateAccessNextPath,
  shouldBypassPrivateAccess,
} from "./private-access.ts";

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

assert.equal(WORKOS_ACCESS_REALM, "WorkOS");
assert.equal(PRIVATE_ACCESS_COOKIE_NAME, "workos_private_access");
assert.equal(PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 90);

assert.deepEqual(getPrivateAccessSettings({}), {
  mode: "disabled",
  username: "will",
  password: null,
});

assert.deepEqual(
  getPrivateAccessSettings({
    VERCEL_ENV: "preview",
  }),
  {
    mode: "misconfigured",
    username: "will",
    password: null,
  }
);

assert.deepEqual(
  getPrivateAccessSettings({
    WORKOS_ACCESS_USER: "will",
    WORKOS_ACCESS_PASSWORD: "open-sesame",
  }),
  {
    mode: "enabled",
    username: "will",
    password: "open-sesame",
  }
);

const settings = getPrivateAccessSettings({
  WORKOS_ACCESS_USER: "will",
  WORKOS_ACCESS_PASSWORD: "open-sesame",
});

assert.equal(isBasicAuthAuthorized(null, settings), false);
assert.equal(isBasicAuthAuthorized("Bearer token", settings), false);
assert.equal(isBasicAuthAuthorized(basicAuth("will", "wrong"), settings), false);
assert.equal(isBasicAuthAuthorized(basicAuth("someone", "open-sesame"), settings), false);
assert.equal(isBasicAuthAuthorized(basicAuth("will", "open-sesame"), settings), true);

assert.equal(isPrivateAccessPasswordValid("wrong", settings), false);
assert.equal(isPrivateAccessPasswordValid("open-sesame", settings), true);

const issuedAt = Date.UTC(2026, 5, 15, 12, 0, 0);
const session = createPrivateAccessSession(settings, issuedAt);

assert.equal(isPrivateAccessSessionAuthorized(null, settings, issuedAt), false);
assert.equal(isPrivateAccessSessionAuthorized("not-a-token", settings, issuedAt), false);
assert.equal(isPrivateAccessSessionAuthorized(session, settings, issuedAt), true);
assert.equal(
  isPrivateAccessSessionAuthorized(
    `${session.slice(0, -1)}x`,
    settings,
    issuedAt
  ),
  false
);
assert.equal(
  isPrivateAccessSessionAuthorized(
    session,
    getPrivateAccessSettings({
      WORKOS_ACCESS_USER: "will",
      WORKOS_ACCESS_PASSWORD: "new-password",
    }),
    issuedAt
  ),
  false
);
assert.equal(
  isPrivateAccessSessionAuthorized(
    session,
    settings,
    issuedAt + (PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS + 1) * 1000
  ),
  false
);

assert.equal(normalizePrivateAccessNextPath("/n/abc?view=board"), "/n/abc?view=board");
assert.equal(normalizePrivateAccessNextPath("https://evil.example/n/abc"), "/");
assert.equal(normalizePrivateAccessNextPath("//evil.example/n/abc"), "/");
assert.equal(normalizePrivateAccessNextPath(""), "/");

assert.equal(shouldBypassPrivateAccess("/api/cron/heartbeat"), true);
assert.equal(shouldBypassPrivateAccess("/api/private-access/login"), true);
assert.equal(shouldBypassPrivateAccess("/login"), true);
assert.equal(shouldBypassPrivateAccess("/login/"), true);
assert.equal(shouldBypassPrivateAccess("/_next/static/chunk.js"), true);
assert.equal(shouldBypassPrivateAccess("/manifest.webmanifest"), true);
assert.equal(shouldBypassPrivateAccess("/icon-192.png"), true);
assert.equal(shouldBypassPrivateAccess("/api/upload"), false);
assert.equal(shouldBypassPrivateAccess("/settings/agents"), false);
