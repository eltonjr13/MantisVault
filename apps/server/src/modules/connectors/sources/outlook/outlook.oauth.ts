import { randomBytes } from "node:crypto";
import { ConnectorError } from "../../connectors.errors";

const STATE_TTL_MS = 10 * 60 * 1000;

export class OutlookOAuthService {
  private readonly states = new Map<string, number>();

  start(): { authUrl: string; state: string } {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
    const tenant = process.env.MICROSOFT_TENANT ?? "common";

    if (!clientId || !redirectUri) {
      throw new ConnectorError("OUTLOOK_OAUTH_NOT_CONFIGURED", "OAuth Microsoft nao configurado.", 503);
    }

    const state = randomBytes(24).toString("base64url");
    this.states.set(state, Date.now());
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access User.Read Mail.Read",
      state
    });

    return {
      state,
      authUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`
    };
  }

  validateState(state: string | undefined): void {
    if (!state) {
      throw new ConnectorError("OUTLOOK_INVALID_STATE", "State OAuth ausente.", 400);
    }

    const createdAt = this.states.get(state);
    this.states.delete(state);

    if (!createdAt || Date.now() - createdAt > STATE_TTL_MS) {
      throw new ConnectorError("OUTLOOK_INVALID_STATE", "State OAuth invalido ou expirado.", 400);
    }
  }
}
