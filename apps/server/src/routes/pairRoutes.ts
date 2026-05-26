import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import type { FastifyInstance } from "fastify";
import type { AuthSession } from "@kazvault/shared";
import type { PairingService } from "../services/pairingService";
import type { LogService } from "../services/logService";
import type { AuthSessionService } from "../services/authSessionService";

const QR_REFRESH_SECONDS = 120;

interface PairQr {
  payload: {
    app: "KazVault";
    version: 1;
    serverName: string;
    baseUrl: string;
    token: string;
    expiresAt: string;
    fingerprint: string;
  };
  connectUrl: string;
  mobileUrl: string;
  refreshSeconds: number;
  qrText: string;
  qrDataUrl: string;
}

export async function registerPairRoutes(
  app: FastifyInstance,
  pairingService: PairingService,
  log: LogService,
  authSessionService?: AuthSessionService
): Promise<void> {
  app.post("/api/pair/start", async () => {
    const payload = pairingService.startPairing();
    await log.info("pairing_started", { expiresAt: payload.expiresAt, baseUrl: payload.baseUrl });
    return payload;
  });

  app.post<{ Body: { token?: string; deviceName?: string } }>("/api/pair/confirm", async (request, reply) => {
    const deviceName = request.body?.deviceName ?? "Celular";
    const confirmed = pairingService.confirm(request.body?.token, deviceName);

    if (!confirmed) {
      return reply.code(401).send({
        error: "PAIRING_EXPIRED",
        message: "QR Code expirado ou invalido."
      });
    }

    const authSession = authSessionService?.createAnonymousSession({ deviceName });
    await log.info("pairing_confirmed", {
      deviceName,
      authMode: authSession ? "persistent_anonymous_session" : "pair_token"
    });

    const response: { confirmed: true; confirmedAt: string; authSession?: AuthSession } = {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    };

    if (authSession) {
      response.authSession = authSession;
    }

    return response;
  });

  app.get<{ Querystring: { token?: string } }>("/api/pair/status", async (request, reply) => {
    return reply.header("cache-control", "no-store").send(pairingService.getStatus(request.query.token));
  });

  app.get("/", async (_request, reply) => {
    return reply.redirect("/pair");
  });

  app.get("/pair", async (_request, reply) => {
    const qr = await createPairQr(pairingService, 460, true);
    return reply.header("cache-control", "no-store").type("text/html; charset=utf-8").send(renderPairPage(qr));
  });

  app.get("/app/kazvault.apk", async (_request, reply) => {
    const apkPath = findAndroidApk();

    if (!apkPath) {
      return reply.code(404).type("text/html; charset=utf-8").send(renderApkMissingPage());
    }

    return reply
      .header("content-disposition", 'attachment; filename="kazvault-debug.apk"')
      .type("application/vnd.android.package-archive")
      .send(createReadStream(apkPath));
  });

  app.get<{ Querystring: { fresh?: string } }>("/pair/qr.png", async (request, reply) => {
    const qr = await createPairQr(pairingService, 720, request.query.fresh === "1");
    const buffer = await QRCode.toBuffer(qr.qrText, {
      errorCorrectionLevel: "M",
      margin: 2,
      type: "png",
      width: 720
    });

    return reply.header("cache-control", "no-store").type("image/png").send(buffer);
  });

  app.get<{ Querystring: { p?: string } }>("/pair/connect", async (request, reply) => {
    const encodedPayload = request.query.p;

    if (!encodedPayload) {
      return reply.code(400).type("text/html; charset=utf-8").send(renderConnectErrorPage());
    }

    const payload = parseEncodedPayload(encodedPayload);

    if (!payload) {
      return reply.code(400).type("text/html; charset=utf-8").send(renderConnectErrorPage());
    }

    return reply.header("cache-control", "no-store").type("text/html; charset=utf-8").send(
      renderConnectPage({
        serverName: payload.serverName,
        baseUrl: payload.baseUrl,
        mobileUrl: createMobilePairUrl(payload, encodedPayload),
        expiresAt: payload.expiresAt
      })
    );
  });

  app.get<{ Querystring: { fresh?: string } }>("/api/pair/qr", async (request, reply) => {
    const qr = await createPairQr(pairingService, 320, request.query.fresh === "1");
    return reply.header("cache-control", "no-store").send(qr);
  });
}

async function createPairQr(pairingService: PairingService, width: number, fresh = false): Promise<PairQr> {
  const payload = fresh ? pairingService.startPairing() : pairingService.getPayload();
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const connectUrl = createConnectUrl(payload, encodedPayload);
  const mobileUrl = createMobilePairUrl(payload, encodedPayload);
  const qrText = connectUrl;
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    errorCorrectionLevel: "M",
    margin: 1,
    width
  });

  return {
    payload,
    connectUrl,
    mobileUrl,
    refreshSeconds: QR_REFRESH_SECONDS,
    qrText,
    qrDataUrl
  };
}

function renderPairPage(qr: PairQr): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KazVault Pareamento</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #080b10; color: #eef4f2; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 28px; background: radial-gradient(circle at 50% 0%, rgba(137,216,203,.18), transparent 34%), #080b10; }
      main { width: min(760px, 100%); display: grid; gap: 20px; }
      header { display: grid; gap: 8px; text-align: center; }
      h1 { margin: 0; font-size: clamp(2.2rem, 8vw, 5rem); line-height: .95; }
      p { margin: 0; color: #a8b3bd; }
      .qr-card { display: grid; justify-items: center; gap: 16px; padding: 22px; border: 1px solid rgba(137,216,203,.28); border-radius: 8px; background: rgba(12,18,29,.92); box-shadow: 0 24px 70px rgba(0,0,0,.38); }
      img { width: min(460px, 100%); height: auto; border-radius: 8px; background: #fff; padding: 12px; }
      .server { width: 100%; display: grid; gap: 8px; padding: 14px; border: 1px solid rgba(148,163,184,.22); border-radius: 8px; background: rgba(2,6,23,.42); }
      .server strong, code { overflow-wrap: anywhere; }
      .server span { color: #89d8cb; font-weight: 800; }
      code { color: #ffd08a; }
      .timer { width: 100%; display: grid; gap: 8px; color: #cbd5e1; }
      .timer-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .bar { overflow: hidden; height: 8px; border-radius: 999px; background: rgba(148,163,184,.22); }
      .bar span { display: block; width: 100%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #89d8cb, #ffd08a); transform-origin: left center; }
      .paired-banner { display: none; width: 100%; padding: 14px; border: 1px solid rgba(137,216,203,.4); border-radius: 8px; color: #bdece3; background: rgba(6,95,91,.22); text-align: center; font-weight: 800; }
      .paired .paired-banner { display: block; }
      .paired .timer, .paired ol { display: none; }
      .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
      a, button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 16px; border: 0; border-radius: 8px; color: #061014; background: #89d8cb; font-weight: 800; text-decoration: none; cursor: pointer; }
      .server a.inline-link { display: inline; min-height: 0; padding: 0; color: #89d8cb; background: transparent; text-decoration: underline; }
      .ghost { color: #eef4f2; background: rgba(15,23,42,.78); border: 1px solid rgba(148,163,184,.26); }
      ol { margin: 0; padding-left: 22px; color: #d7dee7; line-height: 1.7; }
      @media (max-width: 640px) { body { padding: 14px; } .qr-card { padding: 16px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p>Kazento Local Vault</p>
        <h1>KazVault</h1>
      </header>
      <section id="pairCard" class="qr-card">
        <img id="pairQr" src="${qr.qrDataUrl}" alt="QR Code de pareamento KazVault" />
        <div id="pairedBanner" class="paired-banner">Celular conectado. O QR foi pausado.</div>
        <div class="timer">
          <div class="timer-row">
            <strong>QR temporario</strong>
            <span id="countdown">02:00</span>
          </div>
          <div class="bar"><span id="countdownBar"></span></div>
        </div>
        <div class="server">
          <span id="serverName">${escapeHtml(qr.payload.serverName)}</span>
          <strong id="baseUrl">${escapeHtml(qr.payload.baseUrl)}</strong>
          <code id="fingerprint">${escapeHtml(qr.payload.fingerprint)}</code>
          <small>APK Android: <a class="inline-link" href="${escapeHtml(createApkUrl(qr.payload.baseUrl))}">${escapeHtml(createApkUrl(qr.payload.baseUrl))}</a></small>
          <small>Token expira em <span id="expiresAt">${escapeHtml(formatDate(qr.payload.expiresAt))}</span></small>
        </div>
        <ol>
          <li>Baixe e instale o APK pelo botao Baixar APK Android.</li>
          <li>Abra o KazVault instalado no celular e entre em Parear.</li>
          <li>Toque em Escanear QR e aponte para este codigo.</li>
          <li>Para teste pelo navegador/PWA, use Abrir KazVault no navegador.</li>
          <li>O QR troca sozinho a cada 2 minutos.</li>
        </ol>
        <div class="actions">
          <a id="mobileUrl" href="${escapeHtml(qr.mobileUrl)}" target="_blank" rel="noreferrer">Abrir KazVault no navegador</a>
          <a href="${escapeHtml(createApkUrl(qr.payload.baseUrl))}" class="ghost">Baixar APK Android</a>
          <a href="/pair/qr.png?fresh=1" target="_blank" rel="noreferrer" class="ghost">Abrir imagem QR</a>
          <button id="refreshButton" class="ghost" type="button">Gerar novo QR</button>
        </div>
      </section>
    </main>
    <script>
      const initialQr = ${safeJson(qr)};
      let currentQr = initialQr;
      let nextRefreshAt = Date.now() + currentQr.refreshSeconds * 1000;
      let refreshing = false;
      let paired = false;
      let refreshTimer = null;
      let statusTimer = null;

      const pairCard = document.getElementById("pairCard");
      const qrImage = document.getElementById("pairQr");
      const serverName = document.getElementById("serverName");
      const baseUrl = document.getElementById("baseUrl");
      const fingerprint = document.getElementById("fingerprint");
      const expiresAt = document.getElementById("expiresAt");
      const mobileUrl = document.getElementById("mobileUrl");
      const countdown = document.getElementById("countdown");
      const countdownBar = document.getElementById("countdownBar");
      const refreshButton = document.getElementById("refreshButton");

      function formatDate(value) {
        return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
      }

      function formatRemaining(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const rest = String(seconds % 60).padStart(2, "0");
        return minutes + ":" + rest;
      }

      function applyQr(qr) {
        if (paired) return;
        currentQr = qr;
        nextRefreshAt = Date.now() + qr.refreshSeconds * 1000;
        qrImage.src = qr.qrDataUrl;
        serverName.textContent = qr.payload.serverName;
        baseUrl.textContent = qr.payload.baseUrl;
        fingerprint.textContent = qr.payload.fingerprint;
        expiresAt.textContent = formatDate(qr.payload.expiresAt);
        mobileUrl.href = qr.mobileUrl;
        updateCountdown();
      }

      function updateCountdown() {
        const remaining = nextRefreshAt - Date.now();
        countdown.textContent = formatRemaining(remaining);
        const ratio = Math.max(0, Math.min(1, remaining / (currentQr.refreshSeconds * 1000)));
        countdownBar.style.transform = "scaleX(" + ratio + ")";
      }

      async function refreshQr() {
        if (refreshing || paired) return;
        refreshing = true;
        refreshButton.textContent = "Atualizando...";
        try {
          const response = await fetch("/api/pair/qr?fresh=1", { cache: "no-store" });
          if (!response.ok) throw new Error("Falha ao gerar QR");
          applyQr(await response.json());
        } finally {
          refreshing = false;
          refreshButton.textContent = "Gerar novo QR";
        }
      }

      async function checkPairStatus() {
        if (paired) return;
        try {
          const response = await fetch("/api/pair/status?token=" + encodeURIComponent(currentQr.payload.token), { cache: "no-store" });
          if (!response.ok) return;
          const status = await response.json();
          if (!status.confirmed) return;
          paired = true;
          pairCard.classList.add("paired");
          countdown.textContent = "Conectado";
          countdownBar.style.transform = "scaleX(1)";
          refreshButton.textContent = "Gerar novo QR";
          if (refreshTimer) window.clearInterval(refreshTimer);
          if (statusTimer) window.clearInterval(statusTimer);
        } catch {
          return;
        }
      }

      refreshButton.addEventListener("click", () => {
        if (paired) {
          location.reload();
          return;
        }
        refreshQr();
      });
      window.setInterval(updateCountdown, 1000);
      refreshTimer = window.setInterval(refreshQr, initialQr.refreshSeconds * 1000);
      statusTimer = window.setInterval(checkPairStatus, 2000);
      applyQr(initialQr);
    </script>
  </body>
</html>`;
}

function renderApkMissingPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>APK KazVault</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #080b10; color: #eef4f2; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 22px; background: #080b10; }
      main { width: min(620px, 100%); display: grid; gap: 14px; padding: 22px; border: 1px solid rgba(137,216,203,.28); border-radius: 8px; background: rgba(12,18,29,.94); }
      h1, p { margin: 0; }
      p { color: #a8b3bd; line-height: 1.55; }
      code { color: #ffd08a; overflow-wrap: anywhere; }
      a { color: #89d8cb; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <h1>APK ainda nao gerado</h1>
      <p>Rode <code>corepack pnpm beta:build</code> no PC. Depois volte para esta pagina e toque em Baixar APK Android.</p>
      <p><a href="/pair">Voltar ao pareamento</a></p>
    </main>
  </body>
</html>`;
}

function renderConnectPage(input: { serverName: string; baseUrl: string; mobileUrl: string; expiresAt: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Abrir KazVault</title>
    <meta http-equiv="refresh" content="1;url=${escapeHtml(input.mobileUrl)}" />
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #080b10; color: #eef4f2; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 22px; background: #080b10; }
      main { width: min(560px, 100%); display: grid; gap: 16px; padding: 22px; border: 1px solid rgba(137,216,203,.28); border-radius: 8px; background: rgba(12,18,29,.94); }
      h1, p { margin: 0; }
      p { color: #a8b3bd; }
      a { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 16px; border-radius: 8px; color: #061014; background: #89d8cb; font-weight: 800; text-decoration: none; }
      code { color: #ffd08a; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <h1>Abrindo KazVault</h1>
      <p>Servidor: <code>${escapeHtml(input.baseUrl)}</code></p>
      <p>PC: ${escapeHtml(input.serverName)}</p>
      <p>Token expira em ${escapeHtml(formatDate(input.expiresAt))}.</p>
      <a href="${escapeHtml(input.mobileUrl)}">Abrir KazVault agora</a>
    </main>
  </body>
</html>`;
}

function renderConnectErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>QR invalido</title></head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#080b10;color:#eef4f2;font-family:system-ui;padding:24px">
    <main style="max-width:520px">
      <h1>QR invalido ou expirado</h1>
      <p>Volte ao PC e gere um novo QR Code em /pair.</p>
    </main>
  </body>
</html>`;
}

function createConnectUrl(payload: { baseUrl: string }, encodedPayload: string): string {
  const url = new URL(payload.baseUrl);
  url.pathname = "/pair/connect";
  url.search = "";
  url.searchParams.set("p", encodedPayload);
  return url.toString();
}

function createApkUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/app/kazvault.apk";
  url.search = "";
  return url.toString();
}

function createMobilePairUrl(payload: { baseUrl: string }, encodedPayload: string): string {
  const url = new URL(payload.baseUrl);
  url.port = process.env.KAZVAULT_MOBILE_PORT ?? "5173";
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("pair", encodedPayload);
  return url.toString();
}

function findAndroidApk(): string | undefined {
  const candidates = [
    process.env.KAZVAULT_ANDROID_APK,
    join(process.cwd(), "apps", "mobile", "dist", "kazvault-debug.apk"),
    join(process.cwd(), "..", "mobile", "dist", "kazvault-debug.apk"),
    join(process.cwd(), "dist", "kazvault-debug.apk")
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => existsSync(candidate));
}

function parseEncodedPayload(encodedPayload: string): { serverName: string; baseUrl: string; expiresAt: string } | undefined {
  try {
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { serverName?: unknown; baseUrl?: unknown; expiresAt?: unknown };

    if (
      typeof payload.serverName !== "string" ||
      typeof payload.baseUrl !== "string" ||
      typeof payload.expiresAt !== "string"
    ) {
      return undefined;
    }

    return {
      serverName: payload.serverName,
      baseUrl: payload.baseUrl,
      expiresAt: payload.expiresAt
    };
  } catch {
    return undefined;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
