const CONFIRMATION_RE = /^(?:go|yes|yep|do it|proceed|start)[.!]?$/i;
const POLITE_CONFIRMATION_RE =
  /^(?:great|ok|okay|cool|awesome|perfect|sounds good|alright|all right)[\s.!?,]+(?:go|yes|yep|do it|proceed|start)[.!]?$/i;
const MENTION_RE = /@(Claude Code|[^\s.!?,]+)/gi;

export function isAgentRunConfirmation(text: string): boolean {
  const normalized = text
    .trim()
    .replace(MENTION_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    CONFIRMATION_RE.test(normalized) ||
    POLITE_CONFIRMATION_RE.test(normalized)
  );
}
