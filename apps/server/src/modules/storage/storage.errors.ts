export type StorageErrorCode =
  | "STORAGE_POOL_NOT_FOUND"
  | "STORAGE_LOCATION_NOT_FOUND"
  | "STORAGE_LOCATION_OFFLINE"
  | "STORAGE_LOCATION_NOT_WRITABLE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "STORAGE_RESERVED_SPACE_VIOLATED"
  | "STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS"
  | "STORAGE_CHUNK_WRITE_FAILED"
  | "STORAGE_INVALID_PATH"
  | "STORAGE_LOCATION_ALREADY_EXISTS"
  | "STORAGE_LOCATION_HAS_EXCLUSIVE_CHUNKS";

const messages: Record<StorageErrorCode, string> = {
  STORAGE_POOL_NOT_FOUND: "Storage pool nao encontrado.",
  STORAGE_LOCATION_NOT_FOUND: "Location de armazenamento nao encontrada.",
  STORAGE_LOCATION_OFFLINE: "Uma location do pool esta offline.",
  STORAGE_LOCATION_NOT_WRITABLE: "A pasta de armazenamento nao permite escrita.",
  STORAGE_QUOTA_EXCEEDED: "O cofre atingiu o limite de armazenamento configurado.",
  STORAGE_RESERVED_SPACE_VIOLATED: "A gravacao comprometeria o espaco livre reservado no disco.",
  STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS: "Modo Protecao exige pelo menos dois discos online.",
  STORAGE_CHUNK_WRITE_FAILED: "Falha ao gravar chunk no storage pool.",
  STORAGE_INVALID_PATH: "Caminho de armazenamento invalido.",
  STORAGE_LOCATION_ALREADY_EXISTS: "Esta pasta ja esta cadastrada no pool.",
  STORAGE_LOCATION_HAS_EXCLUSIVE_CHUNKS: "Esta location possui chunks exclusivos. Execute migracao/rebalanceamento antes de remover."
};

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message = messages[code],
    readonly details: Record<string, unknown> = {},
    readonly statusCode = defaultStatus(code)
  ) {
    super(message);
  }
}

export function asStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  return new StorageError("STORAGE_CHUNK_WRITE_FAILED", error instanceof Error ? error.message : "Erro de armazenamento.");
}

function defaultStatus(code: StorageErrorCode): number {
  switch (code) {
    case "STORAGE_POOL_NOT_FOUND":
    case "STORAGE_LOCATION_NOT_FOUND":
      return 404;
    case "STORAGE_QUOTA_EXCEEDED":
    case "STORAGE_RESERVED_SPACE_VIOLATED":
    case "STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS":
    case "STORAGE_LOCATION_HAS_EXCLUSIVE_CHUNKS":
      return 409;
    default:
      return 400;
  }
}
