import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { ConnectorCredentialsService } from "../../credentials/connector-credentials.service";
import { EmailNormalizer } from "../../normalizers/email.normalizer";
import { FileNormalizer } from "../../normalizers/file.normalizer";
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

  async disconnect(connectorId: string): Promise<void> {
    await this.credentials.delete(connectorId);
    this.repository.updateConnector(connectorId, { status: "disconnected", syncCursor: null });
  }
}
