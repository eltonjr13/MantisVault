export type AndroidUploadStartRequest = {
  deviceId: string;
  fileName: string;
  mimeType?: string;
  size: number;
  relativePath?: string;
};

export type AndroidUploadSession = AndroidUploadStartRequest & {
  uploadId: string;
  connectorId: string;
  tempDir: string;
  createdAt: string;
};
