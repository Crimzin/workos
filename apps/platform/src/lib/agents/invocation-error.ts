const GENERIC_AGENT_FAILURE =
  "The provider returned an error before any text was streamed.";

export function messageFromAgentInvocationError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return extractProviderMessage(err.message);
  }

  if (typeof err === "object" && err !== null) {
    const providerMessage = nestedProviderMessage(err);
    if (providerMessage) return providerMessage;
  }

  if (typeof err === "string" && err.trim()) {
    return extractProviderMessage(err);
  }

  return GENERIC_AGENT_FAILURE;
}

export function agentInvocationFailureReply(
  accumulatedText: string,
  err: unknown
): string {
  const message = messageFromAgentInvocationError(err);
  const trimmed = accumulatedText.trimEnd();
  if (trimmed) {
    return `${trimmed}\n\n_Agent response interrupted: ${message}_`;
  }

  return `_Agent response failed before streaming began: ${message}_`;
}

function extractProviderMessage(message: string): string {
  try {
    const parsed = JSON.parse(message);
    const nested = nestedProviderMessage(parsed);
    if (nested) return nested;
  } catch {
    // Plain error messages are already the useful user-facing text.
  }

  return message;
}

function nestedProviderMessage(value: object): string | null {
  const maybeError = "error" in value ? value.error : null;
  if (
    typeof maybeError === "object" &&
    maybeError !== null &&
    "message" in maybeError &&
    typeof maybeError.message === "string" &&
    maybeError.message.trim()
  ) {
    return maybeError.message;
  }

  if (
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim()
  ) {
    return value.message;
  }

  return null;
}
