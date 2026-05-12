import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { ConnectorError } from "../../connectors.errors";

const STATE_TTL_MS = 10 * 60 * 1000;

export class GmailOAuthService {
  private readonly states = new Map<string, number>();

  createClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new ConnectorError("GMAIL_OAUTH_NOT_CONFIGURED", "OAuth do Gmail nao configurado.", 503);
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  start(): { authUrl: string; state: string } {
    const client = this.createClient();
    const state = randomBytes(24).toString("base64url");
    this.states.set(state, Date.now());
    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      state,
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email"
      ]
    });
    return { authUrl, state };
  }

  validateState(state: string | undefined): void {
    if (!state) {
      throw new ConnectorError("GMAIL_INVALID_STATE", "State OAuth ausente.", 400);
    }

    const createdAt = this.states.get(state);
    this.states.delete(state);

    if (!createdAt || Date.now() - createdAt > STATE_TTL_MS) {
      throw new ConnectorError("GMAIL_INVALID_STATE", "State OAuth invalido ou expirado.", 400);
    }
  }
}
