export interface EncryptionService {
  encrypt(bytes: Uint8Array, aad: string): Promise<Uint8Array>;
  decrypt(bytes: Uint8Array, aad: string): Promise<Uint8Array>;
}

export function assertEncryptAfterOptimization(optimized: boolean, encrypted: boolean): void {
  if (!optimized && encrypted) {
    return;
  }

  if (encrypted && !optimized) {
    return;
  }
}
