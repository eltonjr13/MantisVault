import { Archive, File, FileCode2, FileSpreadsheet, FileText, Folder, ImageIcon, Video } from "lucide-react";
import type { FileKind } from "@/data/mockFiles";

interface FileIconProps {
  kind: FileKind;
}

export function FileIcon({ kind }: FileIconProps) {
  const Icon = {
    pdf: FileText,
    sheet: FileSpreadsheet,
    video: Video,
    image: ImageIcon,
    archive: Archive,
    folder: Folder,
    doc: FileText,
    code: FileCode2
  }[kind] ?? File;

  return (
    <span className={`file-icon file-icon-${kind}`} aria-hidden="true">
      <Icon size={21} />
    </span>
  );
}
