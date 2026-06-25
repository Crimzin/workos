export const MAX_IMPORT_FILE_BYTES = 150 * 1024 * 1024;
export const MAX_IMPORT_BATCH_BYTES = 150 * 1024 * 1024;
export const MAX_IMPORT_FILE_COUNT = 24;

export interface ImportFileCandidate {
  name: string;
  size: number;
  type?: string;
  webkitRelativePath?: string;
}

export interface PlannedImportFile<TFile extends ImportFileCandidate> {
  file: TFile;
  fileName: string;
  byteSize: number;
}

export interface ImportFileSelectionPlan<TFile extends ImportFileCandidate> {
  accepted: Array<PlannedImportFile<TFile>>;
  errors: string[];
}

export function planImportFileSelection<TFile extends ImportFileCandidate>({
  candidates,
  currentByteCount,
  currentFileCount,
}: {
  candidates: TFile[];
  currentByteCount: number;
  currentFileCount: number;
}): ImportFileSelectionPlan<TFile> {
  const importCandidates = candidates.filter(isConversationExportCandidate);
  const availableSlots = MAX_IMPORT_FILE_COUNT - currentFileCount;
  const slotLimitedFiles = importCandidates.slice(0, Math.max(availableSlots, 0));
  const accepted: Array<PlannedImportFile<TFile>> = [];
  const errors = new Set<string>();
  let nextTotalBytes = currentByteCount;

  if (candidates.length > 0 && importCandidates.length === 0) {
    errors.add("No Claude or ChatGPT conversation JSON files found.");
  }

  if (importCandidates.length > availableSlots) {
    errors.add(`Add up to ${MAX_IMPORT_FILE_COUNT} conversation files at a time.`);
  }

  for (const file of slotLimitedFiles) {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      errors.add(`Each conversation file must be 150 MB or less.`);
      continue;
    }
    if (nextTotalBytes + file.size > MAX_IMPORT_BATCH_BYTES) {
      errors.add("Batch limit is 150 MB.");
      continue;
    }
    accepted.push({
      file,
      fileName: candidateDisplayName(file),
      byteSize: file.size,
    });
    nextTotalBytes += file.size;
  }

  return { accepted, errors: [...errors] };
}

function isConversationExportCandidate(file: ImportFileCandidate): boolean {
  const path = candidateDisplayName(file);
  const pathParts = path.split("/");
  const name = pathParts.at(-1) ?? file.name;
  const lowerName = name.toLocaleLowerCase();

  if (pathParts.some((part) => part.startsWith("."))) return false;
  if (!lowerName.endsWith(".json") && file.type !== "application/json") {
    return false;
  }

  const isFolderSelection = Boolean(file.webkitRelativePath);
  if (!isFolderSelection) return true;

  return (
    lowerName.includes("conversation") ||
    lowerName.includes("claude") ||
    lowerName.includes("chatgpt")
  );
}

function candidateDisplayName(file: ImportFileCandidate): string {
  const relativePath = file.webkitRelativePath?.trim();
  return relativePath || file.name;
}
