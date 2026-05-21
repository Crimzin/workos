const CONFIRMATION_RE = /^(?:go|yes|yep|do it|proceed|start)[.!]?$/i;

export function isAgentRunConfirmation(text: string): boolean {
  return CONFIRMATION_RE.test(text.trim());
}
