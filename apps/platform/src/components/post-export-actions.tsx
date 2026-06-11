import { FileDown, FileText } from "lucide-react";

export interface PostExportActionsProps {
  docxHref: string;
  pdfHref: string;
}

export function PostExportActions({ docxHref, pdfHref }: PostExportActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={docxHref}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary"
      >
        <FileText size={15} />
        Download DOCX
      </a>
      <a
        href={pdfHref}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary"
      >
        <FileDown size={15} />
        Download PDF
      </a>
    </div>
  );
}
