import assert from "node:assert/strict";
import {
  agentInvocationFailureReply,
  messageFromAgentInvocationError,
} from "./invocation-error.ts";

const anthropicJsonError = new Error(
  JSON.stringify({
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "Your credit balance is too low to access the Anthropic API.",
    },
    request_id: "req_test",
  })
);

assert.equal(
  messageFromAgentInvocationError(anthropicJsonError),
  "Your credit balance is too low to access the Anthropic API."
);

assert.equal(
  agentInvocationFailureReply("", anthropicJsonError),
  "_Agent response failed before streaming began: Your credit balance is too low to access the Anthropic API._"
);

assert.equal(
  agentInvocationFailureReply("Partial draft", new Error("connection closed")),
  "Partial draft\n\n_Agent response interrupted: connection closed_"
);
