import assert from "node:assert/strict";
import {
  WORKOS_ACCESS_REALM,
  getPrivateAccessSettings,
  isBasicAuthAuthorized,
  shouldBypassPrivateAccess,
} from "./private-access.ts";

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

assert.equal(WORKOS_ACCESS_REALM, "WorkOS");

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

assert.equal(shouldBypassPrivateAccess("/api/cron/heartbeat"), true);
assert.equal(shouldBypassPrivateAccess("/_next/static/chunk.js"), true);
assert.equal(shouldBypassPrivateAccess("/manifest.webmanifest"), true);
assert.equal(shouldBypassPrivateAccess("/icon-192.png"), true);
assert.equal(shouldBypassPrivateAccess("/api/upload"), false);
assert.equal(shouldBypassPrivateAccess("/settings/agents"), false);
