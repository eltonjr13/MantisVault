export type GmailOAuthState = {
  state: string;
  createdAt: number;
};

export type GmailCredentials = {
  tokens: Record<string, unknown>;
  email?: string;
};
