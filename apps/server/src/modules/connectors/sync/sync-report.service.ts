import type { SyncResult } from "../connectors.types";

export class SyncReportService {
  build(result: SyncResult, startedAt: string, finishedAt: string): Record<string, unknown> {
    return {
      connectorId: result.connectorId,
      jobId: result.jobId,
      startedAt,
      finishedAt,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      bytesImported: result.bytesImported,
      warnings: result.warnings,
      errors: result.errors,
      nextCursor: result.nextCursor
    };
  }
}
