import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  CheckCircle2,
  Activity,
  AlertTriangle,
  CalendarDays,
  Cloud,
  Copy,
  Database,
  Download,
  FileUp,
  FolderInput,
  HardDrive,
  KeyRound,
  Link2,
  Mail,
  Pause,
  Plus,
  Play,
  QrCode,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UploadCloud,
  Users,
  Vault
} from "lucide-react";
import type { CompressionAlgorithm, PairPayload, UploadStatus, VaultFileRecord, VaultStats } from "@kazvault/shared";
import {
  applyStoredSession,
  clearPairPayloadFromCurrentUrl,
  clearPairing,
  loadPairing,
  parsePairPayload,
  readPairPayloadFromCurrentUrl,
  savePairing
} from "./services/pairing";
import {
  confirmPairing,
  addStorageLocation,
  checkStorageHealth,
  connectImapConnector,
  createStoragePool,
  deleteFile,
  disconnectConnector,
  fetchPairQr,
  fetchPairPayload,
  getPairStatus,
  getConnectorCapabilities,
  getConnectorItems,
  getStoragePool,
  getStorageUsage,
  getRemoteVaultKeyring,
  getVaultStats,
  importCalendarIcs,
  importCalendarJson,
  importContactsJson,
  importContactsVcf,
  listConnectors,
  listStoragePools,
  planStorageRebalance,
  listFiles,
  saveRemoteVaultKeyring,
  startConnectorSync,
  startGmailConnector,
  updateStoragePool,
  type ConnectorCapability,
  type ConnectorItemRecord,
  type ConnectorRecord,
  type ConnectorSyncResult,
  type ConnectorType,
  type CreateStoragePoolRequest,
  type PairQrResponse,
  type RemoteVaultKeyring,
  type StoragePool,
  type StoragePoolMode,
  type StorageUsage
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

type Tab = "pair" | "sources" | "upload" | "vault" | "storage" | "security";

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
    strategy: string;
    optimized: boolean;
    reason: string;
    warnings: string[];
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
    const sessionPairing = await confirmPairing(payload).catch(() => payload);
    updatePairing(sessionPairing);

    const remoteKeyring = await getRemoteVaultKeyring(sessionPairing);
    const localKeyring = getStoredKeyring();

    if (remoteKeyring && !keyringMatchesRemote(localKeyring, remoteKeyring)) {
      setMasterKey(undefined);
      setPendingRemoteKeyring(remoteKeyring);
      setKeyringExists(Boolean(localKeyring));
      setActiveTab("security");
      return;
    }

    const result = await ensureLocalVault();

    if (result.created && !remoteKeyring) {
      await saveRemoteVaultKeyring(sessionPairing, getRecoveryKeyPackage()).catch(() => undefined);
    }

    setActiveTab(result.created ? "security" : "upload");
  }, [masterKey]);

  useEffect(() => {
    const handleSessionRefresh = () => {
      setPairing((current) => (current ? applyStoredSession(current) : current));
    };

    window.addEventListener("kazvault:session-refreshed", handleSessionRefresh);

    return () => {
      window.removeEventListener("kazvault:session-refreshed", handleSessionRefresh);
    };
  }, []);

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
        <div className="brand-lockup">
          <span className="brand-emblem">
            <Vault size={24} />
          </span>
          <div>
            <span className="brand-kicker">Local-first secure vault</span>
            <h1>KazVault</h1>
          </div>
        </div>
        <div className={locked ? "status-pill status-locked" : "status-pill"}>
          <ShieldCheck size={18} />
          {locked ? "Bloqueado" : "Chave ativa"}
        </div>
      </header>

      <nav className="tabbar" aria-label="Navegacao principal">
        <TabButton icon={<QrCode size={18} />} label="Parear" active={activeTab === "pair"} onClick={() => setActiveTab("pair")} />
        <TabButton
          icon={<Link2 size={18} />}
          label="Fontes"
          active={activeTab === "sources"}
          onClick={() => setActiveTab("sources")}
        />
        <TabButton
          icon={<UploadCloud size={18} />}
          label="Upload"
          active={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
        />
        <TabButton icon={<Vault size={18} />} label="Cofre" active={activeTab === "vault"} onClick={() => setActiveTab("vault")} />
        <TabButton
          icon={<HardDrive size={18} />}
          label="Storage"
          active={activeTab === "storage"}
          onClick={() => setActiveTab("storage")}
        />
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

      {activeTab === "sources" && <SourcesPanel pairing={pairing} />}

      {activeTab === "upload" && (
        <UploadPanel pairing={pairing} masterKey={masterKey} controllers={controllersMap} />
      )}

      {activeTab === "vault" && <VaultPanel pairing={pairing} masterKey={masterKey} />}
      {activeTab === "storage" && <StoragePanel pairing={pairing} />}
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

function useAutoRefresh(refresh: () => Promise<void> | void, deps: ReadonlyArray<unknown>) {
  useEffect(() => {
    const run = () => {
      if (navigator.onLine === false) {
        return;
      }

      void Promise.resolve(refresh()).catch(() => undefined);
    };
    const runWhenVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", runWhenVisible);

    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", runWhenVisible);
    };
  }, deps);
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
  const [pairQr, setPairQr] = useState<PairQrResponse | undefined>();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const nextRefreshAtRef = useRef(0);
  const statusHandledRef = useRef(false);

  async function loadPairQr(fresh = false, baseUrl = manualUrl) {
    setQrLoading(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const nextQr = await fetchPairQr(baseUrl, fresh);
      statusHandledRef.current = false;
      nextRefreshAtRef.current = Date.now() + nextQr.refreshSeconds * 1000;
      setPairQr(nextQr);
      setManualUrl(nextQr.payload.baseUrl);
      setRemainingSeconds(nextQr.refreshSeconds);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Servidor indisponivel.");
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    if (props.pairing) {
      return;
    }

    void loadPairQr(true);
  }, [props.pairing]);

  useEffect(() => {
    if (props.pairing || !pairQr) {
      return;
    }

    const interval = window.setInterval(() => {
      const nextRemaining = Math.max(0, Math.ceil((nextRefreshAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining === 0 && !qrLoading) {
        void loadPairQr(true, pairQr.payload.baseUrl);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [props.pairing, pairQr, qrLoading]);

  useEffect(() => {
    if (props.pairing || !pairQr) {
      return;
    }

    const checkStatus = async () => {
      try {
        const status = await getPairStatus(pairQr.payload.baseUrl, pairQr.payload.token);

        if (status.confirmed && !statusHandledRef.current) {
          statusHandledRef.current = true;
          setNotice("Dispositivo conectado.");
          props.onPair(pairQr.payload);
          return;
        }

        if (!status.active && !qrLoading) {
          void loadPairQr(true, pairQr.payload.baseUrl);
        }
      } catch {
        return;
      }
    };

    void checkStatus();
    const interval = window.setInterval(checkStatus, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [props.pairing, props.onPair, pairQr, qrLoading]);

  const refreshRatio = pairQr ? Math.max(0, Math.min(1, remainingSeconds / pairQr.refreshSeconds)) : 0;

  if (props.pairing) {
    return (
      <section className="panel pair-connect-panel">
        <div className="pair-mobile-title">
          <Smartphone size={17} />
          <span>Dispositivo Conectado</span>
          <ShieldCheck size={17} />
        </div>

        <div className="pair-connected-state">
          <CheckCircle2 size={24} />
          <div>
            <strong>Celular pareado</strong>
            <span>O QR Code foi removido desta aba.</span>
          </div>
        </div>

        <div className="server-card pair-server-card">
          <span>{props.pairing.serverName}</span>
          <strong>{props.pairing.baseUrl}</strong>
          <code>{props.pairing.fingerprint}</code>
          <small>Sessao ativa ate {formatDate(props.pairing.expiresAt)}</small>
          <button className="ghost-button compact" type="button" onClick={props.onClear}>
            Remover
          </button>
        </div>

        {error && <p className="error-line">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel pair-connect-panel">
      <div className="pair-mobile-title">
        <Smartphone size={17} />
        <span>Conectar Celular</span>
        <ShieldCheck size={17} />
      </div>

      <div className="pair-hero-copy">
        <h2>Escaneie no celular</h2>
        <p>Este QR Code e gerado pelo servidor local</p>
      </div>

      <div className="pair-real-qr-frame">
        {pairQr ? (
          <img className="pair-real-qr" src={pairQr.qrDataUrl} alt="QR Code de pareamento KazVault" />
        ) : (
          <div className="pair-qr-loading" aria-live="polite">
            <QrCode size={64} />
            <span>{qrLoading ? "Gerando QR..." : "QR indisponivel"}</span>
          </div>
        )}
      </div>

      {pairQr && (
        <div className="pair-qr-timer">
          <div className="pair-qr-timer-row">
            <strong>QR temporario</strong>
            <span>{formatCountdown(remainingSeconds)}</span>
          </div>
          <div className="pair-qr-timer-bar">
            <span style={{ transform: `scaleX(${refreshRatio})` }} />
          </div>
        </div>
      )}

      {pairQr && (
        <div className="server-card pair-server-card">
          <span>{pairQr.payload.serverName}</span>
          <strong>{pairQr.payload.baseUrl}</strong>
          <code>{pairQr.payload.fingerprint}</code>
          <small>Expira em {formatDate(pairQr.payload.expiresAt)}</small>
        </div>
      )}

      <div className="pair-scan-actions">
        <button className="primary-button" type="button" onClick={() => void loadPairQr(true)} disabled={qrLoading}>
          <RefreshCcw size={18} />
          Atualizar QR
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!pairQr}
          onClick={() => {
            if (!pairQr) {
              return;
            }

            void navigator.clipboard.writeText(pairQr.connectUrl).catch(() => setError("Nao foi possivel copiar o link."));
          }}
        >
          <Copy size={18} />
          Copiar link
        </button>
      </div>

      <details className="advanced-pairing">
        <summary>Opcao manual</summary>
        <form
          className="form-grid pair-manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadPairQr(true, manualUrl);
          }}
        >
          <label>
            URL do servidor
            <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} inputMode="url" />
          </label>
          <button className="ghost-button" type="submit" disabled={qrLoading}>
            <QrCode size={18} />
            Gerar QR
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setError(undefined);
              void fetchPairPayload(manualUrl)
                .then(props.onPair)
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Servidor indisponivel."));
            }}
          >
            <Link2 size={18} />
            Parear direto
          </button>
        </form>

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
            <Copy size={16} />
            Parear manualmente
          </button>
        </form>
      </details>

      {notice && <p className="notice-line">{notice}</p>}

      {error && <p className="error-line">{error}</p>}
    </section>
  );
}

function SourcesPanel(props: { pairing?: PairPayload }) {
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [capabilities, setCapabilities] = useState<ConnectorCapability[]>([]);
  const [items, setItems] = useState<Record<string, ConnectorItemRecord[]>>({});
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>();
  const [busyKey, setBusyKey] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [gmailPending, setGmailPending] = useState(false);
  const [imapForm, setImapForm] = useState({
    host: "imap.example.com",
    port: 993,
    secure: true,
    email: "",
    appPassword: ""
  });
  const [contactsForm, setContactsForm] = useState({
    deviceId: "mobile-device",
    file: undefined as File | undefined,
    jsonText: `[
  {
    "id": "android_contact_id",
    "displayName": "Nome",
    "phones": ["11999999999"],
    "emails": ["nome@example.com"]
  }
]`
  });
  const [calendarForm, setCalendarForm] = useState({
    deviceId: "mobile-device",
    file: undefined as File | undefined,
    jsonText: `[
  {
    "id": "calendar_event_id",
    "title": "Evento",
    "start": "2026-05-12T10:00:00Z",
    "end": "2026-05-12T11:00:00Z",
    "location": "Sala A"
  }
]`
  });

  const connectorsByType = useMemo(() => {
    const map = new Map<ConnectorType, ConnectorRecord>();

    for (const connector of connectors) {
      if (!map.has(connector.type)) {
        map.set(connector.type, connector);
      }
    }

    return map;
  }, [connectors]);

  async function refresh(nextConnectorId?: string) {
    if (!props.pairing) {
      setConnectors([]);
      setCapabilities([]);
      setItems({});
      setSelectedConnectorId(undefined);
      return;
    }

    setError(undefined);

    try {
      const [nextConnectors, nextCapabilities] = await Promise.all([
        listConnectors(props.pairing),
        getConnectorCapabilities(props.pairing)
      ]);
      setConnectors(nextConnectors);
      setCapabilities(nextCapabilities);
      const connectorId = nextConnectorId ?? nextConnectors[0]?.id;
      setSelectedConnectorId(connectorId);

      if (connectorId) {
        const nextItems = await getConnectorItems(props.pairing, connectorId);
        setItems((current) => ({ ...current, [connectorId]: nextItems.slice(0, 8) }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel carregar fontes do cofre.");
    }
  }

  useAutoRefresh(() => refresh(), [props.pairing?.baseUrl, props.pairing?.token]);

  useEffect(() => {
    if (!props.pairing || !selectedConnectorId || items[selectedConnectorId]) {
      return;
    }

    void getConnectorItems(props.pairing, selectedConnectorId)
      .then((nextItems) => {
        setItems((current) => ({ ...current, [selectedConnectorId]: nextItems.slice(0, 8) }));
      })
      .catch(() => undefined);
  }, [props.pairing, selectedConnectorId, items]);

  async function runBusy(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);

    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operacao falhou.");
    } finally {
      setBusyKey(undefined);
    }
  }

  async function handleGmailConnect() {
    if (!props.pairing) {
      return;
    }

    await runBusy("gmail-connect", async () => {
      const { authUrl } = await startGmailConnector(props.pairing!);
      setGmailPending(true);
      window.open(authUrl, "_blank", "noopener,noreferrer");
      setNotice("Conclua o login do Gmail na nova aba e depois toque em Atualizar.");
    });
  }

  async function handleSync(connector: ConnectorRecord) {
    if (!props.pairing) {
      return;
    }

    await runBusy(`sync:${connector.id}`, async () => {
      const result = await startConnectorSync(props.pairing!, connector.id);
      setNotice(renderSyncNotice(result));
      await refresh(connector.id);
    });
  }

  async function handleDisconnect(connector: ConnectorRecord) {
    if (!props.pairing) {
      return;
    }

    await runBusy(`disconnect:${connector.id}`, async () => {
      await disconnectConnector(props.pairing!, connector.id, false);
      setNotice("Fonte desconectada com seguranca.");
      await refresh();
    });
  }

  async function handleImapConnect() {
    if (!props.pairing) {
      return;
    }

    await runBusy("imap-connect", async () => {
      await connectImapConnector(props.pairing!, imapForm);
      setImapForm((current) => ({ ...current, appPassword: "" }));
      setNotice("Fonte conectada com seguranca. Credenciais criptografadas localmente.");
      await refresh();
    });
  }

  async function handleContactsVcf() {
    if (!props.pairing || !contactsForm.file) {
      return;
    }

    await runBusy("contacts-vcf", async () => {
      const result = await importContactsVcf(props.pairing!, {
        file: contactsForm.file!,
        deviceId: contactsForm.deviceId
      });
      setNotice(renderSyncNotice(result));
      setContactsForm((current) => ({ ...current, file: undefined }));
      await refresh(result.connectorId);
    });
  }

  async function handleContactsJson() {
    if (!props.pairing) {
      return;
    }

    await runBusy("contacts-json", async () => {
      const result = await importContactsJson(props.pairing!, {
        deviceId: contactsForm.deviceId,
        contacts: JSON.parse(contactsForm.jsonText) as Array<{ id?: string; displayName?: string; phones?: string[]; emails?: string[] }>
      });
      setNotice(renderSyncNotice(result));
      await refresh(result.connectorId);
    });
  }

  async function handleCalendarIcs() {
    if (!props.pairing || !calendarForm.file) {
      return;
    }

    await runBusy("calendar-ics", async () => {
      const result = await importCalendarIcs(props.pairing!, {
        file: calendarForm.file!,
        deviceId: calendarForm.deviceId
      });
      setNotice(renderSyncNotice(result));
      setCalendarForm((current) => ({ ...current, file: undefined }));
      await refresh(result.connectorId);
    });
  }

  async function handleCalendarJson() {
    if (!props.pairing) {
      return;
    }

    await runBusy("calendar-json", async () => {
      const result = await importCalendarJson(props.pairing!, {
        deviceId: calendarForm.deviceId,
        events: JSON.parse(calendarForm.jsonText) as Array<{ id?: string; title?: string; start?: string; end?: string; location?: string }>
      });
      setNotice(renderSyncNotice(result));
      await refresh(result.connectorId);
    });
  }

  return (
    <section className="panel sources-panel">
      <div className="panel-heading">
        <Link2 size={22} />
        <div>
          <h2>Fontes do Cofre</h2>
          <p>Nenhum dado e enviado para nuvem. Use apenas fontes e arquivos autorizados.</p>
        </div>
      </div>

      {!props.pairing && <p className="notice-line">Pareamento necessario para visualizar e conectar fontes.</p>}

      {props.pairing && (
        <>
          <div className="sources-toolbar">
            <div className="source-badge-row">
              <span className="storage-badge active">Local-first</span>
              <span className="storage-badge active">Criptografado</span>
            </div>
            <button className="ghost-button" type="button" onClick={() => void refresh(selectedConnectorId)}>
              <RefreshCcw size={18} />
              Atualizar
            </button>
          </div>

          <div className="connectors-grid">
            {capabilities.map((capability) => {
              const connector = connectorsByType.get(capability.type);
              const isBusy = busyKey?.startsWith(capability.type) || busyKey?.includes(connector?.id ?? "");

              return (
                <article className="connector-card" key={capability.type}>
                  <div className="connector-card-head">
                    <div className="connector-card-title">
                      <ConnectorIcon type={capability.type} />
                      <div>
                        <strong>{capability.name}</strong>
                        <span>{connector?.accountIdentifier ?? connectorLabel(capability.type)}</span>
                      </div>
                    </div>
                    <ConnectorStatusBadge status={connector?.status ?? "disconnected"} />
                  </div>

                  <div className="source-badge-row">
                    <span className="storage-badge active">Local-first</span>
                    <span className="storage-badge active">Criptografado</span>
                    {!capability.available && <span className="storage-badge degraded">Configurar env</span>}
                  </div>

                  <p className="connector-copy">{connectorHelp(capability.type, connector, gmailPending)}</p>

                  <div className="connector-meta">
                    <span>Ultima sync: {connector?.lastSyncAt ? formatDate(connector.lastSyncAt) : "Ainda nao sincronizado"}</span>
                    <span>Itens: {connector ? connectors.filter((item) => item.type === connector.type).length : 0}</span>
                  </div>

                  {capability.type === "gmail" && (
                    <div className="inline-actions">
                      <button className="primary-button" type="button" disabled={!capability.available || Boolean(isBusy)} onClick={() => void handleGmailConnect()}>
                        <Mail size={18} />
                        {connector ? "Reconectar" : "Conectar"}
                      </button>
                      {connector && (
                        <>
                          <button className="ghost-button" type="button" disabled={Boolean(isBusy)} onClick={() => void handleSync(connector)}>
                            <RefreshCcw size={18} />
                            Sincronizar
                          </button>
                          <button className="ghost-button" type="button" disabled={Boolean(isBusy)} onClick={() => void handleDisconnect(connector)}>
                            Desconectar
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {capability.type === "outlook" && (
                    <div className="inline-actions">
                      <button className="ghost-button" type="button" disabled={!capability.available || Boolean(isBusy)}>
                        <Cloud size={18} />
                        OAuth MVP
                      </button>
                    </div>
                  )}

                  {capability.type === "imap" && (
                    <form
                      className="form-grid"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleImapConnect();
                      }}
                    >
                      <label>
                        Email
                        <input value={imapForm.email} onChange={(event) => setImapForm((current) => ({ ...current, email: event.target.value }))} />
                      </label>
                      <label>
                        Host IMAP
                        <input value={imapForm.host} onChange={(event) => setImapForm((current) => ({ ...current, host: event.target.value }))} />
                      </label>
                      <div className="connector-form-row">
                        <label>
                          Porta
                          <input
                            type="number"
                            value={imapForm.port}
                            onChange={(event) => setImapForm((current) => ({ ...current, port: Number(event.target.value) }))}
                          />
                        </label>
                        <label className="connector-toggle">
                          Seguro
                          <input
                            type="checkbox"
                            checked={imapForm.secure}
                            onChange={(event) => setImapForm((current) => ({ ...current, secure: event.target.checked }))}
                          />
                        </label>
                      </div>
                      <label>
                        Senha de app
                        <input
                          type="password"
                          value={imapForm.appPassword}
                          onChange={(event) => setImapForm((current) => ({ ...current, appPassword: event.target.value }))}
                        />
                      </label>
                      <div className="inline-actions">
                        <button className="primary-button" type="submit" disabled={Boolean(isBusy)}>
                          <Mail size={18} />
                          Conectar IMAP
                        </button>
                        {connector && (
                          <button className="ghost-button" type="button" disabled={Boolean(isBusy)} onClick={() => void handleDisconnect(connector)}>
                            Desconectar
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                  {capability.type === "mobile-contacts" && (
                    <div className="connector-import-stack">
                      <label>
                        Device ID
                        <input
                          value={contactsForm.deviceId}
                          onChange={(event) => setContactsForm((current) => ({ ...current, deviceId: event.target.value }))}
                        />
                      </label>
                      <label className="file-drop compact-drop">
                        <Users size={20} />
                        <span>{contactsForm.file?.name ?? "Selecionar VCF autorizado"}</span>
                        <input
                          type="file"
                          accept=".vcf,text/vcard"
                          onChange={(event) => setContactsForm((current) => ({ ...current, file: event.target.files?.[0] }))}
                        />
                      </label>
                      <div className="inline-actions">
                        <button className="primary-button" type="button" disabled={!contactsForm.file || Boolean(isBusy)} onClick={() => void handleContactsVcf()}>
                          <FolderInput size={18} />
                          Importar VCF
                        </button>
                      </div>
                      <label>
                        JSON autorizado
                        <textarea
                          rows={6}
                          value={contactsForm.jsonText}
                          onChange={(event) => setContactsForm((current) => ({ ...current, jsonText: event.target.value }))}
                        />
                      </label>
                      <button className="ghost-button" type="button" disabled={Boolean(isBusy)} onClick={() => void handleContactsJson()}>
                        <Users size={18} />
                        Importar JSON
                      </button>
                    </div>
                  )}

                  {capability.type === "mobile-calendar" && (
                    <div className="connector-import-stack">
                      <label>
                        Device ID
                        <input
                          value={calendarForm.deviceId}
                          onChange={(event) => setCalendarForm((current) => ({ ...current, deviceId: event.target.value }))}
                        />
                      </label>
                      <label className="file-drop compact-drop">
                        <CalendarDays size={20} />
                        <span>{calendarForm.file?.name ?? "Selecionar ICS autorizado"}</span>
                        <input
                          type="file"
                          accept=".ics,text/calendar"
                          onChange={(event) => setCalendarForm((current) => ({ ...current, file: event.target.files?.[0] }))}
                        />
                      </label>
                      <div className="inline-actions">
                        <button className="primary-button" type="button" disabled={!calendarForm.file || Boolean(isBusy)} onClick={() => void handleCalendarIcs()}>
                          <FolderInput size={18} />
                          Importar ICS
                        </button>
                      </div>
                      <label>
                        JSON autorizado
                        <textarea
                          rows={6}
                          value={calendarForm.jsonText}
                          onChange={(event) => setCalendarForm((current) => ({ ...current, jsonText: event.target.value }))}
                        />
                      </label>
                      <button className="ghost-button" type="button" disabled={Boolean(isBusy)} onClick={() => void handleCalendarJson()}>
                        <CalendarDays size={18} />
                        Importar JSON
                      </button>
                    </div>
                  )}

                  {capability.type === "android-files" && (
                    <p className="connector-note">
                      O app Android usa seletor autorizado e envia chunks para o backend. O fluxo visivel ao usuario fica na aba Upload.
                    </p>
                  )}

                  {capability.type === "local-files" && (
                    <p className="connector-note">
                      Importacao local do PC depende de caminhos absolutos autorizados no backend. Para esta interface mobile, use Upload ou chame o endpoint pelo PC.
                    </p>
                  )}

                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={!connector}
                    onClick={() => setSelectedConnectorId(connector?.id)}
                  >
                    Ver itens
                  </button>
                </article>
              );
            })}
          </div>

          <section className="connector-items-panel">
            <div className="panel-heading">
              <Database size={20} />
              <div>
                <h2>Itens importados</h2>
                <p>Metadados minimos; dados sensiveis ficam no vault criptografado.</p>
              </div>
            </div>

            {!selectedConnectorId && <p className="notice-line">Escolha uma fonte conectada para ver os itens recentes.</p>}

            {selectedConnectorId && (
              <div className="connector-items-table">
                {(items[selectedConnectorId] ?? []).length === 0 && <p className="notice-line">Nenhum item importado ainda nesta fonte.</p>}
                {(items[selectedConnectorId] ?? []).map((item) => (
                  <article className="connector-item-row" key={item.id}>
                    <div>
                      <strong>{item.title ?? item.sourceType}</strong>
                      <span>{item.sourceType}</span>
                    </div>
                    <div>
                      <span>{item.mimeType ?? "Sem mime"}</span>
                      <span>{item.originalSize ? formatBytes(item.originalSize) : "Sem tamanho"}</span>
                    </div>
                    <span>{formatDate(item.importedAt)}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {notice && <p className="notice-line">{notice}</p>}
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
  const [storagePools, setStoragePools] = useState<StoragePool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [poolError, setPoolError] = useState<string | undefined>();
  const ready = Boolean(props.pairing && props.masterKey);
  const visiblePools = useMemo(
    () => [...storagePools].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [storagePools]
  );

  useAutoRefresh(() => {
    if (!props.pairing) {
      setStoragePools([]);
      setSelectedPoolId(undefined);
      return;
    }

    return listStoragePools(props.pairing)
      .then((pools) => {
        setStoragePools(pools);
        const sorted = [...pools].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setSelectedPoolId((current) => current ?? sorted[0]?.id);
        setPoolError(undefined);
      })
      .catch((reason: unknown) => {
        setPoolError(reason instanceof Error ? reason.message : "Nao foi possivel carregar storage pools.");
      });
  }, [props.pairing?.baseUrl, props.pairing?.token]);

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
        poolId: selectedPoolId,
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

      {visiblePools.length > 1 && (
        <label className="pool-select">
          Storage pool
          <select value={selectedPoolId ?? ""} onChange={(event) => setSelectedPoolId(event.target.value || undefined)}>
            {visiblePools.map((pool) => (
              <option key={pool.id} value={pool.id} title={formatPoolSelectLabel(pool)}>
                {formatPoolSelectLabel(pool)}
              </option>
            ))}
          </select>
        </label>
      )}

      {poolError && <p className="error-line">{poolError}</p>}

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

  const canLoad = Boolean(props.pairing);
  const canDownload = Boolean(props.pairing && props.masterKey);

  async function refresh() {
    if (!props.pairing) {
      return;
    }

    setError(undefined);

    try {
      const [nextStats, nextFiles] = await Promise.all([
        getVaultStats(props.pairing),
        listFiles(props.pairing)
      ]);
      setStats(nextStats);
      setFiles(nextFiles);

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

  useAutoRefresh(() => refresh(), [props.pairing?.baseUrl, props.pairing?.token, props.masterKey]);

  const usedPercent = useMemo(() => {
    const total = stats?.diskTotalBytes ?? stats?.limitBytes ?? 0;

    if (!stats || total === 0) {
      return 0;
    }

    return Math.min(100, (stats.usedBytes / total) * 100);
  }, [stats]);

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

      {canLoad && <p className="notice-line">Configuracao de armazenamento agora fica na aba Storage.</p>}

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
                      level: metadata[file.id].compressionLevel,
                      strategy: metadata[file.id].optimizationStrategy,
                      optimized: metadata[file.id].optimized,
                      reason: metadata[file.id].decisionReason,
                      warnings: metadata[file.id].warnings
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

function StoragePanel(props: { pairing?: PairPayload }) {
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [usage, setUsage] = useState<StorageUsage | undefined>();
  const [locations, setLocations] = useState<StorageUsage["locations"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [plan, setPlan] = useState<string | undefined>();
  const [form, setForm] = useState({
    name: "MantisVault Vault",
    mode: "single" as StoragePoolMode,
    rootPath: "D:/MantisVaultPool",
    quotaGb: 100,
    reservedGb: 20
  });
  const [locationForm, setLocationForm] = useState({
    label: "Novo Disco",
    rootPath: "E:/MantisVaultPool",
    quotaGb: 100,
    reservedGb: 20
  });

  const selectedPool = useMemo(
    () => pools.find((pool) => pool.id === selectedPoolId) ?? pools[0],
    [pools, selectedPoolId]
  );

  async function refresh(nextPoolId = selectedPool?.id) {
    if (!props.pairing) {
      return;
    }

    setError(undefined);

    try {
      const nextPools = await listStoragePools(props.pairing);
      setPools(nextPools);
      const poolId = nextPoolId ?? nextPools[0]?.id;
      setSelectedPoolId(poolId);

      if (poolId) {
        const [details, nextUsage] = await Promise.all([
          getStoragePool(props.pairing, poolId),
          getStorageUsage(props.pairing, poolId)
        ]);
        setUsage(nextUsage);
        setLocations(details.locations.map((location) => ({
          location,
          availableBytes: Math.max(0, location.quotaBytes - location.usedBytes - location.reservedFreeBytes),
          usedPercent: location.quotaBytes > 0 ? Math.min(100, (location.usedBytes / location.quotaBytes) * 100) : 0
        })));
      } else {
        setUsage(undefined);
        setLocations([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel carregar armazenamento.");
    }
  }

  useAutoRefresh(() => refresh(), [props.pairing?.baseUrl, props.pairing?.token]);

  async function run(action: () => Promise<void>) {
    if (!props.pairing) {
      return;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    setPlan(undefined);

    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operacao falhou.");
    } finally {
      setBusy(false);
    }
  }

  async function createPool() {
    if (!props.pairing) {
      return;
    }

    const body: CreateStoragePoolRequest = {
      name: form.name,
      mode: form.mode,
      quotaBytes: gbToBytes(form.quotaGb),
      reservedFreeBytes: gbToBytes(form.reservedGb),
      warningThresholdPercent: 80,
      criticalThresholdPercent: 95,
      locations: [{
        label: "Disco Principal",
        rootPath: form.rootPath,
        quotaBytes: gbToBytes(form.quotaGb),
        reservedFreeBytes: gbToBytes(form.reservedGb)
      }]
    };
    const created = await createStoragePool(props.pairing, body);
    setNotice(created.warnings[0] ?? "Storage pool criado.");
    await refresh(created.pool.id);
  }

  async function addLocation() {
    if (!props.pairing || !selectedPool) {
      return;
    }

    const result = await addStorageLocation(props.pairing, selectedPool.id, {
      label: locationForm.label,
      rootPath: locationForm.rootPath,
      quotaBytes: gbToBytes(locationForm.quotaGb),
      reservedFreeBytes: gbToBytes(locationForm.reservedGb)
    });
    setNotice(result.warnings[0] ?? "Location adicionada.");
    await refresh(selectedPool.id);
  }

  const modes: Array<{ mode: StoragePoolMode; title: string; text: string }> = [
    { mode: "single", title: "Pasta Unica", text: "Use uma pasta ou disco para armazenar o cofre. Ideal para comecar." },
    { mode: "pooled-capacity", title: "Capacidade Maxima", text: "Une varios discos em um cofre logico maior. Usa mais espaco, mas nao duplica dados." },
    { mode: "mirrored", title: "Protecao", text: "Salva copias dos chunks em dois discos diferentes. Reduz a capacidade util, mas aumenta a seguranca." },
    { mode: "hybrid", title: "Smart Pool", text: "Distribuicao inteligente por importancia do arquivo. Em breve." }
  ];

  return (
    <section className="panel storage-panel">
      <div className="panel-heading">
        <HardDrive size={22} />
        <div>
          <h2>Armazenamento</h2>
          <p>Storage Pool local com quota, reserva livre e locations por chunk.</p>
        </div>
      </div>

      {!props.pairing && <p className="notice-line">Pareamento necessario para configurar armazenamento.</p>}

      <div className="storage-section">
        <div className="storage-section-header">
          <h3>Resumo</h3>
          <p>Visao rapida de capacidade, uso e alertas.</p>
        </div>
        {selectedPool && usage && (
          <>
            <div className="storage-overview">
              <div>
                <span>MantisVault Vault</span>
                <strong>{formatBytes(usage.usefulCapacityBytes)} disponiveis</strong>
                <small>{modeTitle(selectedPool.mode)} - {selectedPool.status}</small>
              </div>
              <StorageHealthBadge status={selectedPool.status} />
            </div>
            <StorageUsageBar percent={usage.usedPercent} />
            <div className="stats-grid">
              <div><span>Usado</span><strong>{formatBytes(selectedPool.usedBytes)}</strong></div>
              <div><span>Quota</span><strong>{formatBytes(selectedPool.quotaBytes)}</strong></div>
              <div><span>Disponivel</span><strong>{formatBytes(usage.availableBytes)}</strong></div>
              <div><span>Reserva</span><strong>{formatBytes(selectedPool.reservedFreeBytes)}</strong></div>
            </div>
          </>
        )}
        {usage?.alerts.length ? <StorageWarningsPanel alerts={usage.alerts} /> : null}
      </div>

      <div className="storage-section">
        <div className="storage-section-header">
          <h3>Configuracao</h3>
          <p>Modo de armazenamento e gerenciamento de discos/pastas.</p>
        </div>
        <div className="mode-grid">
          {modes.map((item) => (
            <button
              className={selectedPool?.mode === item.mode || form.mode === item.mode ? "mode-card active" : "mode-card"}
              type="button"
              key={item.mode}
              disabled={item.mode === "hybrid" || busy}
              onClick={() => {
                setForm((current) => ({ ...current, mode: item.mode }));
                if (props.pairing && selectedPool) {
                  void run(async () => {
                    await updateStoragePool(props.pairing!, selectedPool.id, { mode: item.mode });
                    await refresh(selectedPool.id);
                  });
                }
              }}
            >
              <Database size={20} />
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>

        <div className="location-list">
          {locations.map((item) => (
            <article className="location-card" key={item.location.id}>
              <div>
                <HardDrive size={20} />
                <div>
                  <strong>{item.location.label}</strong>
                  <span>{item.location.rootPath}</span>
                </div>
              </div>
              <StorageUsageBar percent={item.usedPercent} />
              <div className="location-meta">
                <span>{formatBytes(item.location.usedBytes)} usados</span>
                <span>{formatBytes(item.availableBytes)} disponiveis</span>
                <StorageLocationBadge status={item.location.status} />
              </div>
            </article>
          ))}
        </div>

        <form
          className="storage-builder"
          onSubmit={(event) => {
            event.preventDefault();
            void run(createPool);
          }}
        >
          <label>
            Nome do pool
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Pasta principal
            <input value={form.rootPath} onChange={(event) => setForm((current) => ({ ...current, rootPath: event.target.value }))} />
          </label>
          <StorageQuotaSlider label="Quota do cofre" value={form.quotaGb} onChange={(quotaGb) => setForm((current) => ({ ...current, quotaGb }))} />
          <StorageQuotaSlider label="Reserva livre" value={form.reservedGb} min={1} max={200} onChange={(reservedGb) => setForm((current) => ({ ...current, reservedGb }))} />
          <button className="primary-button" type="submit" disabled={!props.pairing || busy}>
            <Plus size={18} />
            Criar pool
          </button>
        </form>

        {selectedPool && (
          <form
            className="storage-builder"
            onSubmit={(event) => {
              event.preventDefault();
              void run(addLocation);
            }}
          >
            <label>
              Label
              <input value={locationForm.label} onChange={(event) => setLocationForm((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label>
              Nova location
              <input value={locationForm.rootPath} onChange={(event) => setLocationForm((current) => ({ ...current, rootPath: event.target.value }))} />
            </label>
            <StorageQuotaSlider label="Quota da location" value={locationForm.quotaGb} onChange={(quotaGb) => setLocationForm((current) => ({ ...current, quotaGb }))} />
            <button className="ghost-button" type="submit" disabled={!props.pairing || busy}>
              <Plus size={18} />
              Adicionar disco
            </button>
          </form>
        )}
      </div>

      <details className="storage-section advanced-storage">
        <summary>Avancado</summary>
        <p>Acoes de manutencao e balanceamento do pool.</p>
        <div className="queue-actions">
          <button className="ghost-button" type="button" disabled={!selectedPool || busy} onClick={() => void refresh(selectedPool?.id)}>
            <RefreshCcw size={18} />
            Atualizar
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={!props.pairing || !selectedPool || busy}
            onClick={() => void run(async () => {
              if (!props.pairing || !selectedPool) return;
              const result = await checkStorageHealth(props.pairing, selectedPool.id);
              setNotice(`Health: ${result.pool.status}`);
              await refresh(selectedPool.id);
            })}
          >
            <Activity size={18} />
            Health
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={!props.pairing || !selectedPool || busy}
            onClick={() => void run(async () => {
              if (!props.pairing || !selectedPool) return;
              setPlan(JSON.stringify(await planStorageRebalance(props.pairing, selectedPool.id), null, 2));
            })}
          >
            <Database size={18} />
            Plano rebalance
          </button>
        </div>
        {plan && <pre className="rebalance-plan">{plan}</pre>}
      </details>

      {notice && <p className="notice-line">{notice}</p>}
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}

function StorageQuotaSlider(props: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label>
      {props.label}: {props.value} GB
      <input
        type="range"
        min={props.min ?? 10}
        max={props.max ?? 2048}
        step={1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StorageUsageBar(props: { percent: number }) {
  return (
    <div className="progress-track large">
      <span style={{ width: `${Math.min(100, Math.max(0, props.percent))}%` }} />
    </div>
  );
}

function StorageHealthBadge(props: { status: string }) {
  return (
    <span className={`storage-badge ${props.status}`}>
      <Activity size={16} />
      {props.status}
    </span>
  );
}

function StorageLocationBadge(props: { status: string }) {
  return <span className={`storage-badge ${props.status}`}>{props.status}</span>;
}

function StorageWarningsPanel(props: { alerts: StorageUsage["alerts"] }) {
  return (
    <div className="storage-warnings">
      {props.alerts.map((alert) => (
        <p key={`${alert.code}-${alert.locationId ?? "pool"}`}>
          <AlertTriangle size={16} />
          {alert.message}
        </p>
      ))}
    </div>
  );
}

function ConnectorIcon(props: { type: ConnectorType }) {
  const icons: Record<ConnectorType, JSX.Element> = {
    "local-files": <FolderInput size={20} />,
    "android-files": <Smartphone size={20} />,
    "mobile-contacts": <Users size={20} />,
    "mobile-calendar": <CalendarDays size={20} />,
    gmail: <Mail size={20} />,
    outlook: <Cloud size={20} />,
    imap: <Mail size={20} />,
    "manual-import": <UploadCloud size={20} />
  };

  return icons[props.type];
}

function ConnectorStatusBadge(props: { status: ConnectorRecord["status"] }) {
  const labels: Record<ConnectorRecord["status"], string> = {
    connected: "Conectado",
    connecting: "Conectando",
    disconnected: "Desconectado",
    syncing: "Sincronizando",
    error: "Erro",
    revoked: "Revogado"
  };

  return <span className={`storage-badge ${props.status}`}>{labels[props.status]}</span>;
}

function connectorLabel(type: ConnectorType): string {
  const labels: Record<ConnectorType, string> = {
    "local-files": "Arquivos autorizados no PC",
    "android-files": "Uploads autorizados pelo Android",
    "mobile-contacts": "VCF ou JSON autorizado",
    "mobile-calendar": "ICS ou JSON autorizado",
    gmail: "OAuth Google",
    outlook: "OAuth Microsoft",
    imap: "Senha de app recomendada",
    "manual-import": "Importacao manual"
  };

  return labels[type];
}

function connectorHelp(type: ConnectorType, connector?: ConnectorRecord, gmailPending = false): string {
  if (type === "gmail") {
    if (gmailPending) {
      return "Abra a aba do Google, autorize a conta e depois volte aqui para atualizar o status.";
    }

    return connector
      ? "Fonte conectada com seguranca. O sync importa mensagens recentes e anexos com limite controlado."
      : "Conecte sua conta Google via OAuth oficial. O corpo do email nao fica em texto puro no SQLite.";
  }

  if (type === "outlook") {
    return "Estrutura OAuth pronta para Microsoft Graph. O sync completo ainda e MVP futuro.";
  }

  if (type === "imap") {
    return connector
      ? "Credenciais criptografadas localmente. Use sincronizacao quando o backend IMAP estiver completo."
      : "Use host IMAP seguro e senha de app quando o provedor oferecer.";
  }

  if (type === "mobile-contacts") {
    return "Importe VCF ou JSON exportado pelo usuario. Telefones e emails ficam mascarados nos metadados.";
  }

  if (type === "mobile-calendar") {
    return "Importe ICS ou JSON autorizado. Descricoes sensiveis nao sao persistidas em texto puro.";
  }

  if (type === "android-files") {
    return "Arquivos do celular entram pelo backend em chunks autorizados e passam pelo mesmo pipeline do vault.";
  }

  if (type === "local-files") {
    return "Importacao local usa caminhos absolutos autorizados no PC e nao apaga o arquivo original.";
  }

  return "Fonte manual local-first preparada para extensoes futuras.";
}

function renderSyncNotice(result: ConnectorSyncResult): string {
  const prefix = result.status === "completed" ? "Sincronizacao concluida" : "Sincronizacao finalizada com alertas";
  return `${prefix}: ${result.imported} importados, ${result.skipped} ignorados, ${result.failed} falhas.`;
}

function CompressionSummary(props: {
  summary: {
    originalSize: number;
    compressedSize: number;
    algorithm: CompressionAlgorithm | string;
    level: number;
    strategy?: string;
    optimized?: boolean;
    reason?: string;
    warnings?: string[];
  };
}) {
  const reduction = calculateReductionPercent(props.summary.originalSize, props.summary.compressedSize);
  const savedBytes = props.summary.originalSize - props.summary.compressedSize;
  const algorithmLabel = formatCompressionLabel(props.summary.algorithm, props.summary.strategy);
  const resultLabel = props.summary.optimized
    ? `Economia ${formatPercent(reduction)}`
    : props.summary.strategy === "skip"
      ? "Original preservado"
      : "Sem ganho relevante";

  return (
    <div className={reduction >= 0 ? "compression-summary" : "compression-summary negative"}>
      <span>
        {formatBytes(props.summary.originalSize)} -&gt; {formatBytes(props.summary.compressedSize)}
      </span>
      <strong>{resultLabel}</strong>
      <small>
        {algorithmLabel}
        {props.summary.optimized ? " - Otimizado sem perda" : " - Criptografia aplicada"} - {formatBytes(Math.abs(savedBytes))}
      </small>
      {props.summary.reason && <small>{props.summary.reason}</small>}
    </div>
  );
}

function formatCompressionLabel(algorithm: CompressionAlgorithm | string, strategy?: string): string {
  if (algorithm === "deflate-fflate" && strategy && !["skip", "deflate-fflate"].includes(strategy)) {
    return `${formatCompressionAlgorithm(strategy)} (fallback seguro)`;
  }

  return formatCompressionAlgorithm(strategy ?? algorithm);
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

function gbToBytes(value: number): number {
  return Math.max(0, Math.round(value)) * 1024 * 1024 * 1024;
}

function modeTitle(mode: StoragePoolMode): string {
  const labels: Record<StoragePoolMode, string> = {
    single: "Pasta Unica",
    "pooled-capacity": "Capacidade Maxima",
    mirrored: "Protecao",
    hybrid: "Smart Pool"
  };

  return labels[mode];
}

function formatPoolSelectLabel(pool: StoragePool): string {
  const shortId = pool.id.slice(0, 8);
  const available = Math.max(0, pool.quotaBytes - pool.usedBytes);
  return `${pool.name} (${modeTitle(pool.mode)}) - ${formatBytes(available)} - ${pool.status} - #${shortId}`;
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
  const labels: Record<string, string> = {
    store: "Original Preservado",
    skip: "Original Preservado",
    "deflate-fflate": "Compressao sem perda",
    zstd: "Zstandard",
    brotli: "Brotli",
    xz: "XZ/LZMA2",
    "jpeg-xl-lossless": "JPEG XL Lossless",
    "jpegtran-lossless": "JPEG Lossless",
    "png-lossless": "PNG Lossless",
    "pdf-lossless": "PDF Lossless",
    "mp4-remux": "MP4 Remux"
  };

  return labels[value] ?? value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCountdown(value: number): string {
  const seconds = Math.max(0, Math.ceil(value));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function keyringMatchesRemote(local: ReturnType<typeof getStoredKeyring>, remote: RemoteVaultKeyring): boolean {
  return Boolean(
    local &&
      local.recoverySaltBase64 === remote.recoverySaltBase64 &&
      local.wrappedMasterKeyWithRecoveryBase64 === remote.wrappedMasterKeyWithRecoveryBase64
  );
}

function shortId(value: string): string {
  return `Arquivo ${value.slice(0, 8)}`;
}
