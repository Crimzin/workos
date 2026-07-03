import type { ContextFidelity } from "./types";

export type ContextTaskType = "ordinary" | "source-heavy";

export interface ContextBudget {
  taskType: ContextTaskType;
  targetChars: number;
  warningChars: number;
}

export interface ChooseContextFidelityInput {
  score: number;
  estimatedChars: number;
  sourceSensitive: boolean;
}

export function contextBudgetForTask(taskType: ContextTaskType): ContextBudget {
  if (taskType === "source-heavy") {
    return {
      taskType,
      targetChars: 80_000,
      warningChars: 120_000,
    };
  }

  return {
    taskType,
    targetChars: 25_000,
    warningChars: 50_000,
  };
}

export function chooseContextFidelity(
  input: ChooseContextFidelityInput
): ContextFidelity {
  if (input.score < 0.5) return "none";
  if (input.score < 0.72) return "metadata";
  if (input.sourceSensitive && input.score >= 0.9) return "selected_window";
  if (input.estimatedChars > 8_000) return "compact_pack";
  return "compact_pack_with_snippet";
}
