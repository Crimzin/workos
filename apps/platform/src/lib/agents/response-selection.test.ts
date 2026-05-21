import assert from "node:assert/strict";
import { buildRequestedAgentMentions } from "./response-selection";

const claude = { id: "claude-1", name: "Claude" };
const codex = { id: "codex-1", name: "Codex" };

assert.deepEqual(
  buildRequestedAgentMentions({
    requestAgentResponse: false,
    mentionedAgents: [claude],
    selectedAgent: codex,
  }),
  []
);

assert.deepEqual(
  buildRequestedAgentMentions({
    requestAgentResponse: true,
    mentionedAgents: [],
    selectedAgent: claude,
  }),
  [claude]
);

assert.deepEqual(
  buildRequestedAgentMentions({
    requestAgentResponse: true,
    mentionedAgents: [codex],
    selectedAgent: claude,
  }),
  [codex]
);

assert.deepEqual(
  buildRequestedAgentMentions({
    requestAgentResponse: true,
    mentionedAgents: [codex, codex],
    selectedAgent: claude,
  }),
  [codex]
);
