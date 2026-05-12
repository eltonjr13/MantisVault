import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  KeyRound,
  Pause,
  Play,
  QrCode,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Vault
} from "lucide-react";
import type { CompressionAlgorithm, PairPayload, UploadStatus, VaultFileRecord, VaultStats } from "@kazvault/shared";
import {
  clearPairPayloadFromCurrentUrl,
  clearPairing,
  loadPairing,
  parsePairPayload,
  readPairPayloadFromCurrentUrl,
  savePairing
} from "./services/pairing";
import {
  confirmPairing,
  deleteFile,
  fetchPairPayload,
  getVaultSettings,
  getRemoteVaultKeyring,
  getVaultStats,
  listFiles,
  saveRemoteVaultKeyring,
  updateVaultSettings,
  type RemoteVaultKeyring
} from "./services/serverClient";
import {
  createAutomaticKeyring,
  getRecoveryKeyPackage,
  getStoredKeyring,
  hasDeviceUnlock,
  hasKeyring,
  importRecoveryKeyPackage,
  unlockWithDevice
} from "./services/vaultKeys";
import { uploadEncryptedFile } from "./services/uploader";
import {
  downloadAndRestoreFile,
  loadVaultFileMetadata,
  saveRestoredFile,
  type VaultFileMetadata
} from "./services/downloader";

type Tab = "pair" | "upload" | "vault" | "security";

interface QueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  detail: string;
  completedChunks: number[];
  compression?: {
    originalSize: number;
    compressedSize: number;
    algorithm: CompressionAlgorithm;
    level: number;
  };
  uploadId?: string;
  fileId?: string;
  error?: string;
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (!hasKeyring()) {
      return "security";
    }

    return hasDeviceUnlock() ? "pair" : "security";
  });
  const [pairing, setPairing] = useState<PairPayload | undefined>(() => loadPairing());
  const [masterKey, setMasterKey] = useState<Uint8Array | undefined>();
  const [keyringExists, setKeyringExists] = useState(() => hasKeyring());
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>();
  const [pendingRemoteKeyring, setPendingRemoteKeyring] = useState<RemoteVaultKeyring | undefined>();
  const [appError, setAppError] = useState<string | undefined>();
  const controllers = useRef(new Map<string, AbortController>());
  const controllersMap = useMemo(() => controllers.current, []);

  const locked = !masterKey;

  function updatePairing(payload: PairPayload | undefined) {
    if (payload) {
      savePairing(payload);
    } else {
      clearPairing();
    }

    setPairing(payload);
  }

  async function ensureLocalVault(): Promise<{ key: Uint8Array; created: boolean }> {
    if (masterKey) {
      return { key: masterKey, created: false };
    }

    if (hasKeyring()) {
      const key = await unlockWithDevice();
      setMasterKey(key);
      setKeyringExists(true);
      return { key, created: false };
    }

    const created = await createAutomaticKeyring();
    setMasterKey(created.masterKey);
    setRecoveryKey(created.recoveryKey);
    setKeyringExists(true);
    return { key: created.masterKey, created: true };
  }

  async function recoverVault(recovery: string): Promise<void> {
    const key = pendingRemoteKeyring
      ? await importRecoveryKeyPackage(pendingRemoteKeyring, recovery)
      : await importRecoveryKeyPackage(getRecoveryKeyPackage(), recovery);

    setMasterKey(key);
    setKeyringExists(true);
    setPendingRemoteKeyring(undefined);
    setActiveTab(pairing ? "upload" : "pair");
  }

  async function createNewVaultAccess(): Promise<void> {
    const created = await createAutomaticKeyring();
    setMasterKey(created.masterKey);
    setRecoveryKey(created.recoveryKey);
    setKeyringExists(true);
    setPendingRemoteKeyring(undefined);

    if (pairing) {
      await saveRemoteVaultKeyring(pairing, getRecoveryKeyPackage()).catch(() => undefined);
    }

    setActiveTab("security");
  }

  const handlePairingCallback = useCallback(async (payload: PairPayload): Promise<void> => {
    updatePairing(payload);
    await confirmPairing(payload).catch(() => undefined);

    if (!hasKeyring()) {
      const remoteKeyring = await getRemoteVaultKeyring(payload);

      if (remoteKeyring) {
        setPendingRemoteKeyring(remoteKeyring);
        setActiveTab("security");
        return;
      }
    }

    const result = await ensureLocalVault();

    if (result.created) {
      await saveRemoteVaultKeyring(payload, getRecoveryKeyPackage()).catch(() => undefined);
    }

    setActiveTab(result.created ? "security" : "upload");
  }, [masterKey]);

  useEffect(() => {
    if (!masterKey && hasKeyring() && hasDeviceUnlock()) {
      void unlockWithDevice()
        .then((key) => {
          setMasterKey(key);
          setKeyringExists(true);
          setActiveTab(loadPairing() ? "upload" : "pair");
        })
        .catch(() => setActiveTab("security"));
    }
  }, []);

  useEffect(() => {
    const incomingPairing = readPairPayloadFromCurrentUrl();

    if (!incomingPairing) {
      return;
    }

    clearPairPayloadFromCurrentUrl();
    void handlePairingCallback(incomingPairing);
  }, [handlePairingCallback]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global error:", event.error);
      setAppError(event.error?.message || "Erro desconhecido");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      setAppError(event.reason?.message || "Erro na promessa");
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (appError) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <span className="brand-kicker">Kazento Local Vault</span>
            <h1>KazVault</h1>
          </div>
        </header>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Erro na Aplicação</h2>
              <p>Ocorreu um erro inesperado.</p>
            </div>
          </div>
          <p className="error-line">{appError}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setAppError(undefined);
              window.location.reload();
            }}
          >
            Recarregar Aplicação
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-kicker">Kazento Local Vault</span>
          <h1>KazVault</h1>
        </div>
        <div className="status-pill">
          <ShieldCheck size={18} />
          {locked ? "Bloqueado" : "Chave ativa"}
        </div>
      </header>

      <nav className="tabbar" aria-label="Navegacao principal">
        <TabButton icon={<QrCode size={18} />} label="Parear" active={activeTab === "pair"} onClick={() => setActiveTab("pair")} />
        <TabButton
          icon={<UploadCloud size={18} />}
          label="Upload"
          active={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
        />
        <TabButton icon={<Vault size={18} />} label="Cofre" active={activeTab === "vault"} onClick={() => setActiveTab("vault")} />
        <TabButton
          icon={<Settings size={18} />}
          label="Seguranca"
          active={activeTab === "security"}
          onClick={() => setActiveTab("security")}
        />
      </nav>

      {activeTab === "security" && (
        <SecurityPanel
          masterKey={masterKey}
          keyringExists={keyringExists}
          recoveryKey={recoveryKey}
          remoteRestoreAvailable={Boolean(pendingRemoteKeyring)}
          onRecovered={recoverVault}
          onResetVault={createNewVaultAccess}
        />
      )}

      {activeTab === "pair" && (
        <PairPanel
          pairing={pairing}
          onPair={(payload) => {
            void handlePairingCallback(payload);
          }}
          onClear={() => updatePairing(undefined)}
        />
      )}

      {activeTab === "upload" && (
        <UploadPanel pairing={pairing} masterKey={masterKey} controllers={controllersMap} />
      )}

      {activeTab === "vault" && <VaultPanel pairing={pairing} masterKey={masterKey} />}
    </main>
  );
}

function TabButton(props: { icon: JSX.Element; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={props.active ? "tab-button active" : "tab-button"} type="button" onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function SecurityPanel(props: {
  masterKey?: Uint8Array;
  keyringExists: boolean;
  recoveryKey?: string;
  remoteRestoreAvailable: boolean;
  onRecovered: (recoveryKey: string) => Promise<void>;
  onResetVault: () => Promise<void>;
}) {
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copyLabel, setCopyLabel] = useState("Copiar chave");
  const stored = getStoredKeyring();
  const canCreateNewAccess = !props.masterKey && (props.keyringExists || props.remoteRestoreAvailable);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);

    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operacao falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <KeyRound size={22} />
        <div>
          <h2>Seguranca</h2>
          <p>Cofre local automatico e chave de recuperacao.</p>
        </div>
      </div>

      {props.remoteRestoreAvailable && (
        <p className="notice-line">
          Este servidor ja tem um cofre. Informe a chave de recuperacao para ativar este celular.
        </p>
      )}

      {!props.keyringExists && !props.remoteRestoreAvailable && (
        <p className="notice-line">
          Escaneie o QR Code do PC para criar o cofre neste celular automaticamente. Nenhuma senha sera solicitada.
        </p>
      )}

      {(props.keyringExists || props.remoteRestoreAvailable) && !props.masterKey && (
        <div className="stack">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => props.onRecovered(recovery));
            }}
          >
            <label>
              Chave de recuperacao
              <input value={recovery} onChange={(event) => setRecovery(event.target.value)} />
            </label>
            <button className="ghost-button" type="submit" disabled={busy}>
              <KeyRound size={18} />
              Recuperar
            </button>
          </form>
        </div>
      )}

      {canCreateNewAccess && (
        <div className="warning-box">
          <strong>Nao tenho a chave de recuperacao</strong>
          <p>
            Crie uma nova chave para liberar novos uploads neste dispositivo. Arquivos antigos continuam criptografados
            pela chave perdida.
          </p>
          <button
            className="ghost-button"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Criar uma nova chave? Arquivos antigos nao serao recuperados sem a chave anterior.")) {
                return;
              }

              void run(props.onResetVault);
            }}
          >
            <RefreshCcw size={18} />
            Criar nova chave
          </button>
        </div>
      )}

      {props.masterKey && (
        <div className="secure-state">
          <CheckCircle2 size={22} />
          <div>
            <strong>Login mantido neste celular</strong>
            <span>Criado em {stored ? formatDate(stored.createdAt) : "sessao atual"}. So sai se limpar cache/dados do site.</span>
          </div>
        </div>
      )}

      {props.recoveryKey && (
        <div className="recovery-box">
          <span>Chave de recuperacao</span>
          <code>{props.recoveryKey}</code>
          <p>Guarde esta chave para recuperacao e futuros dispositivos. Se ela for perdida, os arquivos nao poderao ser restaurados.</p>
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(props.recoveryKey ?? "")
                .then(() => {
                  setCopyLabel("Copiada");
                  window.setTimeout(() => setCopyLabel("Copiar chave"), 1800);
                })
                .catch(() => setError("Nao foi possivel copiar automaticamente. Selecione a chave e copie manualmente."));
            }}
          >
            <Copy size={16} />
            {copyLabel}
          </button>
        </div>
      )}

      {error && <p className="error-line">{error}</p>}
    </section>
  );
}

function PairPanel(props: { pairing?: PairPayload; onPair: (payload: PairPayload) => void; onClear: () => void }) {
  const [manualUrl, setManualUrl] = useState(() => {
    return window.location.hostname ? `http://${window.location.hostname}:4577` : "http://";
  });
  const [qrText, setQrText] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | undefined>();

  async function stopScanner() {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => undefined);
      scannerRef.current.clear();
      scannerRef.current = undefined;
    }

    setScannerActive(false);
  }

  async function startScanner() {
    setError(undefined);
    setScannerActive(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          void stopScanner();
          try {
            props.onPair(parsePairPayload(decodedText));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "QR Code invalido.");
          }
        },
        undefined
      );
    } catch (reason) {
      setScannerActive(false);
      setError(reason instanceof Error ? reason.message : "Camera indisponivel.");
    }
  }

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel-heading">
        <QrCode size={22} />
        <div>
          <h2>Pareamento</h2>
          <p>Escaneie o QR mostrado no PC; sem copiar JSON.</p>
        </div>
      </div>

      {props.pairing && (
        <div className="server-card">
          <span>{props.pairing.serverName}</span>
          <strong>{props.pairing.baseUrl}</strong>
          <code>{props.pairing.fingerprint}</code>
          <small>Expira em {formatDate(props.pairing.expiresAt)}</small>
          <button className="ghost-button compact" type="button" onClick={props.onClear}>
            Remover
          </button>
        </div>
      )}

      <div className="pair-grid">
        <button className="primary-button" type="button" onClick={() => void startScanner()} disabled={scannerActive}>
          <QrCode size={18} />
          Escanear QR
        </button>
        <button className="ghost-button" type="button" onClick={() => void stopScanner()} disabled={!scannerActive}>
          Parar camera
        </button>
      </div>

      <div id="qr-reader" className={scannerActive ? "qr-reader active" : "qr-reader"} />

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          void fetchPairPayload(manualUrl)
            .then(props.onPair)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Servidor indisponivel."));
        }}
      >
        <label>
          URL do servidor
          <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} inputMode="url" />
        </label>
        <button className="ghost-button" type="submit">
          Buscar pareamento
        </button>
      </form>

      <details className="advanced-pairing">
        <summary>Opcao avancada: colar payload</summary>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              props.onPair(parsePairPayload(qrText));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Payload invalido.");
            }
          }}
        >
          <label>
            Payload ou link do QR
            <textarea value={qrText} onChange={(event) => setQrText(event.target.value)} rows={4} />
          </label>
          <button className="ghost-button" type="submit">
            Parear manualmente
          </button>
        </form>
      </details>

      {error && <p className="error-line">{error}</p>}
    </section>
  );
}

function UploadPanel(props: {
  pairing?: PairPayload;
  masterKey?: Uint8Array;
  controllers: Map<string, AbortController>;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const ready = Boolean(props.pairing && props.masterKey);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function startUpload(item: QueueItem) {
    if (!props.pairing || !props.masterKey) {
      return;
    }

    const controller = new AbortController();
    props.controllers.set(item.id, controller);

    updateItem(item.id, { status: "pending", error: undefined });

    try {
      await uploadEncryptedFile({
        file: item.file,
        masterKey: props.masterKey,
        pairing: props.pairing,
        signal: controller.signal,
        resume: {
          uploadId: item.uploadId,
          fileId: item.fileId,
          completedChunks: item.completedChunks
        },
        onProgress: (event) => {
          updateItem(item.id, {
            status: event.status,
            progress: event.progress,
            detail: event.detail,
            compression: event.compression ?? item.compression,
            completedChunks: event.completedChunks ?? item.completedChunks,
            uploadId: event.uploadId ?? item.uploadId,
            fileId: event.fileId ?? item.fileId
          });
        }
      });
    } catch (reason) {
      const aborted = reason instanceof DOMException && reason.name === "AbortError";
      updateItem(item.id, {
        status: aborted ? "paused" : "failed",
        error: aborted ? undefined : reason instanceof Error ? reason.message : "Upload falhou.",
        detail: aborted ? "Pausado" : "Falhou"
      });
    } finally {
      props.controllers.delete(item.id);
    }
  }

  function pauseUpload(id: string) {
    props.controllers.get(id)?.abort();
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <UploadCloud size={22} />
        <div>
          <h2>Upload</h2>
          <p>Compressao, criptografia e chunks de 8MB.</p>
        </div>
      </div>

      {!ready && <p className="notice-line">Desbloqueie o cofre e conclua o pareamento antes de enviar arquivos.</p>}

      <label className={ready ? "file-drop" : "file-drop disabled"}>
        <FileUp size={28} />
        <span>Selecionar arquivos</span>
        <input
          disabled={!ready}
          multiple
          type="file"
          onChange={(event) => {
            try {
              const files = [...(event.target.files ?? [])];
              
              setQueue((items) => {
                const newItems = files.map((file) => ({
                  id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                  file,
                  status: "pending" as UploadStatus,
                  progress: 0,
                  detail: "Aguardando",
                  completedChunks: []
                }));
                return [...items, ...newItems];
              });
              
              event.currentTarget.value = "";
            } catch (error) {
              console.error("Error in file input onChange:", error);
              alert(`Erro ao selecionar arquivos: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
            }
          }}
        />
      </label>

      {queue.length > 0 && (
        <div className="queue-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!ready}
            onClick={() => {
              queue
                .filter((item) => ["pending", "paused", "failed"].includes(item.status))
                .forEach((item) => void startUpload(item));
            }}
          >
            <Play size={18} />
            Enviar fila
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setQueue((items) => items.filter((item) => item.status !== "completed"));
            }}
          >
            <CheckCircle2 size={18} />
            Limpar concluídos
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setQueue([]);
            }}
          >
            <Trash2 size={18} />
            Limpar tudo
          </button>
        </div>
      )}

      <div className="queue-list">
        {queue.map((item) => (
          <article className={`queue-item ${item.status === "completed" ? "completed" : ""}`} key={item.id}>
            <div>
              <strong>{item.file.name}</strong>
              <span>{formatBytes(item.file.size)}</span>
              {item.compression && <CompressionSummary summary={item.compression} />}
            </div>
            <div className="progress-track">
              <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
            <div className="queue-meta">
              <span className={`state-dot ${item.status}`} />
              <span>{item.status}</span>
              <span>{Math.round(item.progress * 100)}%</span>
              <span>{item.detail}</span>
              {item.status === "completed" && <CheckCircle2 size={18} color="#22c55e" />}
            </div>
            {item.error && <p className="error-line">{item.error}</p>}
            {item.status !== "completed" && (
              <div className="inline-actions">
                <button
                  className="ghost-button compact"
                  type="button"
                  disabled={!ready || ["compressing", "encrypting", "uploading"].includes(item.status)}
                  onClick={() => void startUpload(item)}
                >
                  <Play size={16} />
                  Iniciar
                </button>
                <button
                  className="ghost-button compact"
                  type="button"
                  disabled={!["compressing", "encrypting", "uploading"].includes(item.status)}
                  onClick={() => pauseUpload(item.id)}
                >
                  <Pause size={16} />
                  Pausar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function VaultPanel(props: { pairing?: PairPayload; masterKey?: Uint8Array }) {
  const [files, setFiles] = useState<VaultFileRecord[]>([]);
  const [stats, setStats] = useState<VaultStats | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [downloads, setDownloads] = useState<Record<string, { progress: number; detail: string }>>({});
  const [metadata, setMetadata] = useState<Record<string, VaultFileMetadata>>({});
  const [storageInput, setStorageInput] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const canLoad = Boolean(props.pairing);
  const canDownload = Boolean(props.pairing && props.masterKey);

  async function refresh() {
    if (!props.pairing) {
      return;
    }

    setError(undefined);

    try {
      const [nextStats, nextFiles, settings] = await Promise.all([
        getVaultStats(props.pairing),
        listFiles(props.pairing),
        getVaultSettings(props.pairing)
      ]);
      setStats(nextStats);
      setFiles(nextFiles);
      setStorageInput(settings.storageDir);

      if (props.masterKey) {
        const entries = await Promise.all(
          nextFiles
            .filter((file) => file.status === "completed")
            .map(async (file) => {
              try {
                const fileMetadata = await loadVaultFileMetadata({
                  fileId: file.id,
                  pairing: props.pairing!,
                  masterKey: props.masterKey!
                });
                return [file.id, fileMetadata] as const;
              } catch {
                return undefined;
              }
            })
        );
        setMetadata(Object.fromEntries(entries.filter((entry): entry is [string, VaultFileMetadata] => Boolean(entry))));
      } else {
        setMetadata({});
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel carregar o cofre.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.pairing?.baseUrl, props.pairing?.token, props.masterKey]);

  const usedPercent = useMemo(() => {
    const total = stats?.diskTotalBytes ?? stats?.limitBytes ?? 0;

    if (!stats || total === 0) {
      return 0;
    }

    return Math.min(100, (stats.usedBytes / total) * 100);
  }, [stats]);

  async function saveStorageSettings(): Promise<void> {
    if (!props.pairing) {
      return;
    }

    setSettingsBusy(true);
    setError(undefined);

    try {
      await updateVaultSettings(props.pairing, { storageDir: storageInput });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao atualizar armazenamento.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function restoreFile(file: VaultFileRecord): Promise<void> {
    if (!props.pairing || !props.masterKey) {
      setError("Desbloqueie o cofre antes de baixar arquivos.");
      return;
    }

    setError(undefined);
    setDownloads((current) => ({
      ...current,
      [file.id]: { progress: 0, detail: "Preparando" }
    }));

    try {
      const restored = await downloadAndRestoreFile({
        fileId: file.id,
        pairing: props.pairing,
        masterKey: props.masterKey,
        onProgress: (event) => {
          setDownloads((current) => ({
            ...current,
            [file.id]: event
          }));
        }
      });

      saveRestoredFile(restored.fileName, restored.bytes, restored.mimeType);
      setDownloads((current) => ({
        ...current,
        [file.id]: { progress: 1, detail: "Baixado" }
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao restaurar arquivo.");
      setDownloads((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <Vault size={22} />
        <div>
          <h2>Cofre</h2>
          <p>Historico opaco armazenado no HDD reservado.</p>
        </div>
      </div>

      {!canLoad && <p className="notice-line">Pareamento necessario para consultar o cofre.</p>}
      {canLoad && !props.masterKey && <p className="notice-line">Desbloqueie o cofre para baixar arquivos.</p>}

      {stats && (
        <div className="stats-grid">
          <div>
            <span>Cofre</span>
            <strong>{formatBytes(stats.usedBytes)}</strong>
          </div>
          <div>
            <span>Disco</span>
            <strong>{formatBytes(stats.diskTotalBytes ?? stats.limitBytes)}</strong>
          </div>
          <div>
            <span>Livre</span>
            <strong>{formatBytes(stats.diskFreeBytes ?? stats.remainingBytes)}</strong>
          </div>
          <div>
            <span>Arquivos</span>
            <strong>{stats.fileCount}</strong>
          </div>
        </div>
      )}

      {stats && (
        <div className="progress-track large">
          <span style={{ width: `${usedPercent}%` }} />
        </div>
      )}

      {canLoad && (
        <form
          className="storage-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveStorageSettings();
          }}
        >
          <label>
            Pasta de armazenamento no PC
            <input
              value={storageInput}
              onChange={(event) => setStorageInput(event.target.value)}
              placeholder="E:/cloudkz"
            />
          </label>
          <button className="ghost-button" type="submit" disabled={settingsBusy || !storageInput.trim()}>
            <Settings size={18} />
            Salvar pasta
          </button>
        </form>
      )}

      <button className="ghost-button" type="button" disabled={!canLoad} onClick={() => void refresh()}>
        <RefreshCcw size={18} />
        Atualizar
      </button>

      <div className="file-list">
        {files.map((file) => (
          <article className="file-row" key={file.id}>
            <div>
              <strong>{shortId(file.id)}</strong>
              <span>
                {file.totalChunks} chunks · {formatBytes(file.encryptedBytes)} · {formatDate(file.createdAt)}
              </span>
              {metadata[file.id] && (
                <div className="file-metadata">
                  <strong>{metadata[file.id].fileName}</strong>
                  <CompressionSummary
                    summary={{
                      originalSize: metadata[file.id].originalSize,
                      compressedSize: metadata[file.id].compressedSize,
                      algorithm: metadata[file.id].compressionAlgorithm as CompressionAlgorithm,
                      level: metadata[file.id].compressionLevel
                    }}
                  />
                </div>
              )}
              {downloads[file.id] && (
                <div className="download-progress">
                  <div className="progress-track">
                    <span style={{ width: `${Math.round(downloads[file.id].progress * 100)}%` }} />
                  </div>
                  <span>{downloads[file.id].detail}</span>
                </div>
              )}
            </div>
            <div className="file-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Baixar arquivo"
                disabled={!canDownload || Boolean(downloads[file.id] && downloads[file.id].progress < 1)}
                onClick={() => void restoreFile(file)}
              >
                <Download size={18} />
              </button>
            <button
              className="icon-button danger"
              type="button"
              aria-label="Excluir arquivo"
              onClick={() => {
                if (!props.pairing) {
                  return;
                }

                void deleteFile(props.pairing, file.id).then(refresh).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Falha ao excluir.");
                });
              }}
            >
              <Trash2 size={18} />
            </button>
            </div>
          </article>
        ))}
      </div>

      {error && <p className="error-line">{error}</p>}
    </section>
  );
}

function CompressionSummary(props: {
  summary: {
    originalSize: number;
    compressedSize: number;
    algorithm: CompressionAlgorithm | string;
    level: number;
  };
}) {
  const reduction = calculateReductionPercent(props.summary.originalSize, props.summary.compressedSize);
  const savedBytes = props.summary.originalSize - props.summary.compressedSize;
  const resultLabel = reduction >= 0 ? `Economia ${formatPercent(reduction)}` : `Aumentou ${formatPercent(Math.abs(reduction))}`;

  return (
    <div className={reduction >= 0 ? "compression-summary" : "compression-summary negative"}>
      <span>
        {formatBytes(props.summary.originalSize)} -&gt; {formatBytes(props.summary.compressedSize)}
      </span>
      <strong>{resultLabel}</strong>
      <small>
        {formatCompressionAlgorithm(props.summary.algorithm)}
        {props.summary.level > 0 ? ` nivel ${props.summary.level}` : ""} - {formatBytes(Math.abs(savedBytes))}
      </small>
    </div>
  );
}

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function calculateReductionPercent(originalSize: number, compressedSize: number): number {
  if (originalSize <= 0) {
    return 0;
  }

  return 100 - (compressedSize / originalSize) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatCompressionAlgorithm(value: CompressionAlgorithm | string): string {
  if (value === "store") {
    return "sem compressao";
  }

  if (value === "deflate-fflate") {
    return "deflate";
  }

  return value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function shortId(value: string): string {
  return `Arquivo ${value.slice(0, 8)}`;
}
