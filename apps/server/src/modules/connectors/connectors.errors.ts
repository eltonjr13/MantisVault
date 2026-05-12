export class ConnectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

export function asConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }

  if (error instanceof Error) {
    return new ConnectorError("CONNECTOR_ERROR", error.message, 500);
  }

  return new ConnectorError("CONNECTOR_ERROR", "Falha no conector.", 500);
}
