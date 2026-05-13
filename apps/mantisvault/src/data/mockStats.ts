export const vaultStats = {
  storageUsed: "1,42 TB",
  storageTotal: "4,00 TB",
  storagePercent: 35,
  health: "Ótima",
  freeSpace: "2,58 TB",
  files: "12.548",
  folders: "328",
  savedSpace: "482 GB",
  dedupeRate: "3,21x",
  optimizedFiles: "1.248",
  completedTransfers: "56"
};

export const analyticsBars = [38, 52, 31, 64, 58, 76, 49, 68, 55, 71, 62, 84, 73, 89];

export const transferSteps = [
  {
    title: "Otimização inteligente sem perda",
    detail: "Espaço identificado para economia: 1,18 GB (44%)",
    status: "Concluído",
    progress: 100,
    variant: "teal" as const
  },
  {
    title: "Deduplicação por chunks",
    detail: "Chunks repetidos detectados antes do envio",
    status: "Concluído",
    progress: 100,
    variant: "teal" as const
  },
  {
    title: "Criptografia",
    detail: "Chaves geradas localmente e manifest protegido",
    status: "Em andamento",
    progress: 68,
    variant: "coral" as const
  },
  {
    title: "Envio para o cofre local",
    detail: "Chunks enviados: 1.248 / 2.896",
    status: "Aguardando",
    progress: 43,
    variant: "warning" as const
  }
];
