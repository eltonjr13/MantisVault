export type ImapConnectRequest = {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  appPassword: string;
};
