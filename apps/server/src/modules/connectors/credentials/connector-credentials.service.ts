import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../connectors.repository";
import { TokenVaultService } from "./token-vault.service";

export class ConnectorCredentialsService {
  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly tokenVault: TokenVaultService
  ) {}

  async save(connectorId: string, payload: unknown): Promise<string> {
    const ref = await this.tokenVault.encryptJson(payload, this.aad(connectorId));
    this.repository.upsertCredential({
      id: randomUUID(),
      connectorId,
      encryptedPayloadPath: ref,
      now: new Date().toISOString()
    });
    this.repository.updateConnector(connectorId, { encryptedCredentialsRef: ref });
    return ref;
  }

  async load<T>(connectorId: string): Promise<T> {
    const ref = this.repository.findCredentialPath(connectorId);

    if (!ref) {
      throw new Error("Credenciais do conector nao encontradas.");
    }

    return this.tokenVault.decryptJson<T>(ref, this.aad(connectorId));
  }

  async delete(connectorId: string): Promise<void> {
    const ref = this.repository.findCredentialPath(connectorId);
    await this.tokenVault.delete(ref);
    this.repository.deleteCredential(connectorId);
    this.repository.updateConnector(connectorId, { encryptedCredentialsRef: null });
  }

  private aad(connectorId: string): string {
    return `kazvault:connector-credentials:${connectorId}`;
  }
}
