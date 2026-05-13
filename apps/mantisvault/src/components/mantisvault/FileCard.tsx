import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { FileIcon } from "@/components/ui/FileIcon";
import { OptimizationBadge } from "@/components/mantisvault/OptimizationBadge";
import type { VaultFile } from "@/data/mockFiles";

interface FileCardProps {
  file: VaultFile;
}

export function FileCard({ file }: FileCardProps) {
  return (
    <article className="file-row">
      <Link className="file-main" href={`/files/${file.id}`}>
        <FileIcon kind={file.kind} />
        <span>
          <strong>{file.name}</strong>
          <span>
            {file.type} • {file.path}
          </span>
        </span>
      </Link>

      <div className="file-meta-grid">
        <div>
          <span>Status</span>
          <strong>{file.status[0]}</strong>
        </div>
        <div>
          <span>Tamanho</span>
          <strong>{file.size}</strong>
        </div>
        <div>
          <span>Modificado</span>
          <strong>{file.date}</strong>
        </div>
      </div>

      <div className="file-actions">
        <div className="badge-row">
          {file.status.slice(1, 3).map((status) => (
            <OptimizationBadge key={status} status={status} />
          ))}
        </div>
        <button className="icon-button" type="button" aria-label={`Ações de ${file.name}`}>
          <MoreVertical size={18} />
        </button>
      </div>
    </article>
  );
}
