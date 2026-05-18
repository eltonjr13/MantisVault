import type { CompressionAlgorithm, UploadStatus } from "@kazvault/shared";

const DB_NAME = "kazvault-offline-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "queued-uploads";

export interface PersistedCompressionSummary {
  originalSize: number;
  compressedSize: number;
  algorithm: CompressionAlgorithm;
  level: number;
  strategy: string;
  optimized: boolean;
  reason: string;
  warnings: string[];
}

export interface PersistedUploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  detail: string;
  completedChunks: number[];
  queuedAt: string;
  poolId?: string;
  uploadId?: string;
  fileId?: string;
  compression?: PersistedCompressionSummary;
  error?: string;
}

export async function loadOfflineUploadQueue(): Promise<PersistedUploadQueueItem[]> {
  const db = await openDatabase();
  const items = await requestToPromise<PersistedUploadQueueItem[]>(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());

  return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function saveOfflineUploadItem(item: PersistedUploadQueueItem): Promise<void> {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(item));
}

export async function patchOfflineUploadItem(
  id: string,
  patch: Partial<Omit<PersistedUploadQueueItem, "id" | "file" | "queuedAt">>
): Promise<void> {
  const db = await openDatabase();
  const current = await requestToPromise<PersistedUploadQueueItem | undefined>(
    db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id)
  );

  if (!current) {
    return;
  }

  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put({ ...current, ...patch }));
}

export async function deleteOfflineUploadItem(id: string): Promise<void> {
  const db = await openDatabase();
  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id));
}

export async function clearOfflineUploadItems(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  ids.forEach((id) => store.delete(id));
  await transactionDone(tx);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Nao foi possivel abrir a fila offline."));
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operacao local falhou."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transacao local falhou."));
    tx.onabort = () => reject(tx.error ?? new Error("Transacao local cancelada."));
  });
}
