import assert from "node:assert/strict";
import { getCronAuthorizationStatus } from "./heartbeat.ts";

assert.equal(getCronAuthorizationStatus(null, {}), "allowed-local");
assert.equal(
  getCronAuthorizationStatus(null, { VERCEL_ENV: "production" }),
  "misconfigured"
);
assert.equal(
  getCronAuthorizationStatus(null, { CRON_SECRET: "heartbeat-secret" }),
  "unauthorized"
);
assert.equal(
  getCronAuthorizationStatus("Bearer wrong", { CRON_SECRET: "heartbeat-secret" }),
  "unauthorized"
);
assert.equal(
  getCronAuthorizationStatus("Bearer heartbeat-secret", {
    CRON_SECRET: "heartbeat-secret",
  }),
  "authorized"
);
