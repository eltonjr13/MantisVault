import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type {
  ConnectorRecord,
  EmailVaultArchiveRequest,
  EmailVaultArchiveResult,
  EmailVaultCandidate,
  EmailVaultCleanupRequest,
  EmailVaultCleanupResult,
  EmailVaultPlan,
  EmailVaultPlanOptions,
  SyncOptions,
  SyncResult,
  VaultConnector
} from "../../connectors.types";
import { ConnectorCredentialsService } from "../../credentials/connector-credentials.service";
import { EmailNormalizer } from "../../normalizers/email.normalizer";
import { FileNormalizer } from "../../normalizers/file.normalizer";
import { classifyAttachment, classifyEmailCandidate, buildEmailVaultQuery, clampEmailVaultLimit } from "../../email-vault.policy";
import { maskEmail, safeTitle } from "../../utils/safe-metadata";
import type { VaultIngestService } from "../../../vault/ingest/vault-ingest.service";
import { collectGmailAttachmentParts, decodeGmailAttachmentData } from "./gmail.mapper";
import { GmailOAuthService } from "./gmail.oauth";
import type { GmailCredentials } from "./gmail.types";

export class GmailConnector implements VaultConnector {
  readonly type = "gmail" as const;
  private readonly emailNormalizer = new EmailNormalizer();
  private readonly fileNormalizer = new FileNormalizer();

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly credentials: ConnectorCredentialsService,
    private readonly ingest: VaultIngestService,
    readonly oauth: GmailOAuthService
  ) {}

  startOAuth(): { authUrl: string } {
    return { authUrl: this.oauth.start().authUrl };
  }

  async completeOAuth(code: string | undefined, state: string | undefined): Promise<ConnectorRecord> {
    if (!code) {
      throw new ConnectorError("GMAIL_CODE_MISSING", "Codigo OAuth ausente.", 400);
    }

    this.oauth.validateState(state);
    const client = this.oauth.createClient();
    const tokenResponse = await client.getToken(code);
    client.setCredentials(tokenResponse.tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get().catch(() => undefined);
    const email = profile?.data?.email ?? undefined;
    const connector = this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: "Gmail",
      accountIdentifier: email,
      status: "connected",
      createdAt: new Date().toISOString()
    });
    await this.credentials.save(connector.id, {
      tokens: tokenResponse.tokens as unknown as Record<string, unknown>,
      email
    } satisfies GmailCredentials);
    return this.repository.findConnector(connector.id)!;
  }

  async sync(connector: ConnectorRecord, options: SyncOptions): Promise<SyncResult> {
    const limit = Math.min(options.limit ?? Number(process.env.GMAIL_SYNC_LIMIT ?? "25"), options.fullSync ? 500 : 25);
    const warnings: string[] = [];
    const errors: string[] = [];
    let scanned = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let bytesImported = 0;
    let nextCursor: string | undefined;

    try {
      const saved = await this.credentials.load<GmailCredentials>(connector.id);
      const client = this.oauth.createClient();
      client.setCredentials(saved.tokens as any);
      const gmail = google.gmail({ version: "v1", auth: client });
      const list = await gmail.users.messages.list({
        userId: "me",
        maxResults: limit,
        pageToken: options.cursor ?? connector.syncCursor
      });
      nextCursor = list.data.nextPageToken ?? undefined;
      const messages = list.data.messages ?? [];

      for (const messageRef of messages) {
        scanned += 1;

        if (!messageRef.id) {
          skipped += 1;
          continue;
        }

        if (this.repository.findItem(connector.id, messageRef.id)) {
          skipped += 1;
          continue;
        }

        try {
          const message = await gmail.users.messages.get({
            userId: "me",
            id: messageRef.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"]
          });
          const normalized = this.emailNormalizer.normalizeGmailMessage(message.data);
          this.repository.createItem({
            id: randomUUID(),
            connectorId: connector.id,
            sourceId: normalized.sourceId,
            sourceType: "email",
            title: normalized.title,
            importedAt: new Date().toISOString(),
            metadata: normalized.metadata
          });
          imported += 1;

          const fullMessage = await gmail.users.messages.get({ userId: "me", id: messageRef.id, format: "full" });
          const attachments = collectGmailAttachmentParts(fullMessage.data.payload);

          for (const attachment of attachments) {
            const attachmentSourceId = `${messageRef.id}:attachment:${attachment.partId}`;

            if (this.repository.findItem(connector.id, attachmentSourceId)) {
              skipped += 1;
              continue;
            }

            const attachmentResponse = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: messageRef.id,
              id: attachment.attachmentId
            });
            const data = attachmentResponse.data.data;

            if (!data) {
              skipped += 1;
              continue;
            }

            const buffer = decodeGmailAttachmentData(data);
            const result = await this.ingest.ingest(
              this.fileNormalizer.toIngestSource({
                connectorId: connector.id,
                sourceId: attachmentSourceId,
                sourceType: "email-attachment",
                fileName: attachment.filename,
                mimeType: attachment.mimeType,
                buffer,
                metadata: { gmailMessageId: messageRef.id }
              })
            );
            this.repository.createItem({
              id: randomUUID(),
              connectorId: connector.id,
              sourceId: attachmentSourceId,
              sourceType: "email-attachment",
              title: attachment.filename,
              mimeType: attachment.mimeType,
              originalSize: result.originalSize,
              originalHash: result.originalHash,
              storedFileId: result.storedFileId,
              manifestId: result.manifestId,
              importedAt: new Date().toISOString(),
              metadata: { gmailMessageId: messageRef.id }
            });
            imported += 1;
            bytesImported += result.storedSize;
          }
        } catch (error) {
          failed += 1;
          errors.push(error instanceof Error ? error.message : "Falha ao sincronizar mensagem Gmail.");
        }
      }

      return {
        connectorId: connector.id,
        jobId: randomUUID(),
        status: failed > 0 && imported === 0 ? "failed" : "completed",
        scanned,
        imported,
        skipped,
        failed,
        bytesImported,
        nextCursor,
        warnings,
        errors
      };
    } catch (error) {
      return {
        connectorId: connector.id,
        jobId: randomUUID(),
        status: "failed",
        scanned,
        imported,
        skipped,
        failed: failed + 1,
        bytesImported,
        nextCursor,
        warnings,
        errors: [error instanceof Error ? error.message : "Falha ao sincronizar Gmail."]
      };
    }
  }

  async planEmailVault(connector: ConnectorRecord, options: EmailVaultPlanOptions): Promise<EmailVaultPlan> {
    const gmail = await this.createGmailApi(connector.id);
    const query = buildEmailVaultQuery(options);
    const limit = clampEmailVaultLimit(options.limit);
    const warnings = [
      "Gmail nao permite remover somente anexos mantendo o email original. Para liberar espaco, arquive no KazVault e mova a mensagem para a lixeira."
    ];
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: limit,
      q: query
    });
    const candidates: EmailVaultCandidate[] = [];
    const messages = list.data.messages ?? [];

    for (const messageRef of messages) {
      if (!messageRef.id) {
        continue;
      }

      const full = await gmail.users.messages.get({
        userId: "me",
        id: messageRef.id,
        format: "full"
      });
      const candidate = this.toEmailVaultCandidate(connector, full.data);

      if (!candidate || (candidate.archived && options.includeAlreadyArchived !== true)) {
        continue;
      }

      candidates.push(candidate);
    }

    const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);

    return {
      connectorId: connector.id,
      provider: "gmail",
      query,
      scanned: messages.length,
      candidates,
      totalBytes,
      estimatedFreeableBytes: totalBytes,
      warnings
    };
  }

  async archiveEmailVault(connector: ConnectorRecord, request: EmailVaultArchiveRequest): Promise<EmailVaultArchiveResult> {
    const messageIds = [...new Set(request.messageIds ?? [])].filter(Boolean);
    const includeRawEmail = request.includeRawEmail !== false;
    const includeAttachments = request.includeAttachments !== false;
    const gmail = await this.createGmailApi(connector.id);
    const warnings: string[] = [];
    const errors: string[] = [];
    const items: EmailVaultArchiveResult["items"] = [];
    let archived = 0;
    let skipped = 0;
    let failed = 0;
    let bytesArchived = 0;

    if (messageIds.length === 0) {
      return {
        connectorId: connector.id,
        archived,
        skipped,
        failed,
        bytesArchived,
        items,
        warnings: ["Nenhuma mensagem selecionada."],
        errors
      };
    }

    for (const messageId of messageIds) {
      try {
        const full = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
        const headers = extractHeaders(full.data);
        const subject = safeTitle(headers.get("subject"), "Email arquivado");
        const date = gmailDate(full.data);

        if (includeRawEmail) {
          const sourceId = archivedEmailSourceId(messageId);
          const existing = this.repository.findItem(connector.id, sourceId);

          if (existing?.storedFileId) {
            skipped += 1;
          } else {
            const raw = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
            const rawData = raw.data.raw;

            if (!rawData) {
              throw new ConnectorError("GMAIL_RAW_EMAIL_MISSING", "Gmail nao retornou o email bruto para arquivamento.", 502);
            }

            const buffer = decodeGmailAttachmentData(rawData);
            const result = await this.ingest.ingest(
              this.fileNormalizer.toIngestSource({
                connectorId: connector.id,
                sourceId,
                sourceType: "email",
                fileName: emailArchiveFileName(subject, messageId, date),
                mimeType: "message/rfc822",
                buffer,
                metadata: {
                  provider: "gmail",
                  gmailMessageId: messageId,
                  subject,
                  from: maskedHeaderEmail(headers.get("from")),
                  date,
                  archivedAt: new Date().toISOString(),
                  cleanupEligible: true
                }
              })
            );
            const item = this.repository.createItem({
              id: randomUUID(),
              connectorId: connector.id,
              sourceId,
              sourceType: "email",
              title: subject,
              mimeType: "message/rfc822",
              originalSize: result.originalSize,
              originalHash: result.originalHash,
              storedFileId: result.storedFileId,
              manifestId: result.manifestId,
              importedAt: new Date().toISOString(),
              metadata: {
                provider: "gmail",
                gmailMessageId: messageId,
                from: maskedHeaderEmail(headers.get("from")),
                date,
                cleanupEligible: true,
                cleanupStatus: "archived_verified"
              }
            });
            archived += 1;
            bytesArchived += result.storedSize;
            items.push({
              messageId,
              itemId: item.id,
              storedFileId: item.storedFileId,
              type: "email",
              title: subject,
              sizeBytes: result.originalSize
            });
          }
        }

        if (includeAttachments) {
          const attachments = collectGmailAttachmentParts(full.data.payload);

          for (const attachment of attachments) {
            const sourceId = archivedAttachmentSourceId(messageId, attachment.partId);
            const existing = this.repository.findItem(connector.id, sourceId);

            if (existing?.storedFileId) {
              skipped += 1;
              continue;
            }

            const attachmentResponse = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId,
              id: attachment.attachmentId
            });
            const data = attachmentResponse.data.data;

            if (!data) {
              skipped += 1;
              continue;
            }

            const buffer = decodeGmailAttachmentData(data);
            const result = await this.ingest.ingest(
              this.fileNormalizer.toIngestSource({
                connectorId: connector.id,
                sourceId,
                sourceType: "email-attachment",
                fileName: attachment.filename,
                mimeType: attachment.mimeType,
                buffer,
                metadata: {
                  provider: "gmail",
                  gmailMessageId: messageId,
                  subject,
                  from: maskedHeaderEmail(headers.get("from")),
                  archivedAt: new Date().toISOString()
                }
              })
            );
            const item = this.repository.createItem({
              id: randomUUID(),
              connectorId: connector.id,
              sourceId,
              sourceType: "email-attachment",
              title: attachment.filename,
              mimeType: attachment.mimeType,
              originalSize: result.originalSize,
              originalHash: result.originalHash,
              storedFileId: result.storedFileId,
              manifestId: result.manifestId,
              importedAt: new Date().toISOString(),
              metadata: {
                provider: "gmail",
                gmailMessageId: messageId,
                subject,
                from: maskedHeaderEmail(headers.get("from")),
                cleanupEligible: false
              }
            });
            archived += 1;
            bytesArchived += result.storedSize;
            items.push({
              messageId,
              itemId: item.id,
              storedFileId: item.storedFileId,
              type: "attachment",
              title: attachment.filename,
              sizeBytes: result.originalSize
            });
          }
        }
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : `Falha ao arquivar email ${messageId}.`);
      }
    }

    warnings.push("Nenhuma mensagem foi apagada. Use a acao de limpeza depois de validar o arquivamento.");

    return {
      connectorId: connector.id,
      archived,
      skipped,
      failed,
      bytesArchived,
      items,
      warnings,
      errors
    };
  }

  async cleanupEmailVault(connector: ConnectorRecord, request: EmailVaultCleanupRequest): Promise<EmailVaultCleanupResult> {
    if (request.confirmation !== "ARCHIVE_VERIFIED") {
      throw new ConnectorError("EMAIL_CLEANUP_CONFIRMATION_REQUIRED", "Confirme ARCHIVE_VERIFIED antes de limpar a caixa.", 400);
    }

    if (request.action !== "move-to-trash") {
      throw new ConnectorError(
        "GMAIL_CLEANUP_ACTION_UNSUPPORTED",
        "Gmail neste MVP suporta apenas mover mensagens arquivadas para a lixeira.",
        400
      );
    }

    const messageIds = [...new Set(request.messageIds ?? [])].filter(Boolean);
    const gmail = await this.createGmailApi(connector.id);
    const warnings = [
      "Mensagens movidas para a lixeira ainda podem ocupar espaco ate a lixeira ser esvaziada pelo Gmail."
    ];
    const errors: string[] = [];
    let cleaned = 0;
    let skipped = 0;
    let failed = 0;

    for (const messageId of messageIds) {
      const archive = this.repository.findItem(connector.id, archivedEmailSourceId(messageId));

      if (!archive?.storedFileId) {
        skipped += 1;
        warnings.push(`Email ${shortId(messageId)} ignorado: arquivo .eml verificado nao encontrado no KazVault.`);
        continue;
      }

      try {
        await gmail.users.messages.trash({ userId: "me", id: messageId });
        cleaned += 1;
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : `Falha ao mover ${shortId(messageId)} para a lixeira.`);
      }
    }

    return {
      connectorId: connector.id,
      action: request.action,
      cleaned,
      skipped,
      failed,
      warnings,
      errors
    };
  }

  async disconnect(connectorId: string): Promise<void> {
    await this.credentials.delete(connectorId);
    this.repository.updateConnector(connectorId, { status: "disconnected", syncCursor: null });
  }

  private async createGmailApi(connectorId: string) {
    const saved = await this.credentials.load<GmailCredentials>(connectorId);
    const client = this.oauth.createClient();
    client.setCredentials(saved.tokens as any);
    return google.gmail({ version: "v1", auth: client });
  }

  private toEmailVaultCandidate(connector: ConnectorRecord, message: any): EmailVaultCandidate | undefined {
    const messageId = String(message.id ?? "");

    if (!messageId) {
      return undefined;
    }

    const headers = extractHeaders(message);
    const subject = safeTitle(headers.get("subject"), "Email");
    const attachments = collectGmailAttachmentParts(message.payload).map((attachment) => {
      const classified = classifyAttachment(attachment.filename, attachment.mimeType);

      return {
        id: attachment.partId,
        fileName: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        important: classified.important,
        reasons: classified.reasons
      };
    });
    const classified = classifyEmailCandidate({
      subject,
      from: headers.get("from"),
      labels: message.labelIds ?? [],
      attachments
    });
    const archivedItem = this.repository.findItem(connector.id, archivedEmailSourceId(messageId));
    const sizeBytes = Number(message.sizeEstimate ?? 0);

    return {
      id: messageId,
      connectorId: connector.id,
      provider: "gmail",
      messageId,
      subject,
      from: maskedHeaderEmail(headers.get("from")),
      date: gmailDate(message),
      sizeBytes,
      attachmentBytes: attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0),
      attachments,
      importance: classified.importance,
      reasons: classified.reasons,
      cleanupActions: ["move-to-trash"],
      archived: Boolean(archivedItem?.storedFileId),
      archivedItemId: archivedItem?.id,
      labels: message.labelIds ?? []
    };
  }
}

function extractHeaders(message: any): Map<string, string> {
  return new Map(
    (message.payload?.headers ?? []).map((header: { name?: string | null; value?: string | null }) => [
      String(header.name ?? "").toLowerCase(),
      String(header.value ?? "")
    ])
  );
}

function gmailDate(message: any): string | undefined {
  if (message.internalDate) {
    return new Date(Number(message.internalDate)).toISOString();
  }

  return extractHeaders(message).get("date");
}

function maskedHeaderEmail(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? maskEmail(match[0]) : "[masked-email]";
}

function archivedEmailSourceId(messageId: string): string {
  return `archive:gmail:${messageId}:eml`;
}

function archivedAttachmentSourceId(messageId: string, partId: string): string {
  return `archive:gmail:${messageId}:attachment:${partId}`;
}

function emailArchiveFileName(subject: string, messageId: string, date?: string): string {
  const datePart = date ? date.slice(0, 10) : "sem-data";
  const cleanSubject = subject
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "email";

  return `${datePart}-${cleanSubject}-${shortId(messageId)}.eml`;
}

function shortId(value: string): string {
  return value.slice(0, 10);
}
