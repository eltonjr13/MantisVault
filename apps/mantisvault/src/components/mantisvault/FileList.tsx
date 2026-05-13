import { FileCard } from "@/components/mantisvault/FileCard";
import type { VaultFile } from "@/data/mockFiles";

interface FileListProps {
  files: VaultFile[];
}

export function FileList({ files }: FileListProps) {
  return (
    <div className="file-list">
      {files.map((file) => (
        <FileCard file={file} key={file.id} />
      ))}
    </div>
  );
}
