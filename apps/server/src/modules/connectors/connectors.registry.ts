import { ConnectorError } from "./connectors.errors";
import type { ConnectorType, VaultConnector } from "./connectors.types";

export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorType, VaultConnector>();

  register(connector: VaultConnector): void {
    if (this.connectors.has(connector.type)) {
      throw new ConnectorError("CONNECTOR_ALREADY_REGISTERED", `Conector ${connector.type} ja registrado.`, 409);
    }

    this.connectors.set(connector.type, connector);
  }

  get(type: ConnectorType): VaultConnector {
    const connector = this.connectors.get(type);

    if (!connector) {
      throw new ConnectorError("CONNECTOR_NOT_AVAILABLE", `Conector ${type} nao registrado.`, 404);
    }

    return connector;
  }

  list(): VaultConnector[] {
    return [...this.connectors.values()];
  }

  has(type: ConnectorType): boolean {
    return this.connectors.has(type);
  }
}
