import { Badge } from "@/components/ui/Badge";
import type { VaultFileStatus } from "@/data/mockFiles";

interface OptimizationBadgeProps {
  status: VaultFileStatus;
}

export function OptimizationBadge({ status }: OptimizationBadgeProps) {
  const variant = {
    "Arquivo já otimizado": "info",
    "Original preservado": "muted",
    "Otimizado sem perda": "success",
    "Compactado com sucesso": "success",
    Criptografado: "info",
    Deduplicado: "warning"
  }[status] as "success" | "warning" | "danger" | "info" | "coral" | "muted";

  return <Badge variant={variant}>{status}</Badge>;
}
