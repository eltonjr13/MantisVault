import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../connectors.repository";
import type { ConnectorSyncJob, SyncResult } from "../connectors.types";
import { SyncProgressGateway } from "./sync-progress.gateway";
import { SyncReportService } from "./sync-report.service";

export class SyncJobService {
  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly progress: SyncProgressGateway,
    private readonly reports: SyncReportService
  ) {}

  start(connectorId: string): ConnectorSyncJob {
    const job = this.repository.createJob({
      id: randomUUID(),
      connectorId,
      status: "running",
      startedAt: new Date().toISOString()
    });
    this.progress.emit("connector.sync.started", {
      jobId: job.id,
      connectorId,
      scanned: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      message: "Sincronizacao iniciada."
    });
    return job;
  }

  complete(result: SyncResult): ConnectorSyncJob | undefined {
    const job = this.repository.findJob(result.jobId);
    const finishedAt = new Date().toISOString();
    const report = this.reports.build(result, job?.startedAt ?? finishedAt, finishedAt);
    const updated = this.repository.updateJob(result.jobId, {
      status: result.status,
      finishedAt,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      bytesImported: result.bytesImported,
      errorMessage: result.errors[0],
      report
    });
    this.progress.emit(result.status === "completed" ? "connector.sync.completed" : "connector.sync.failed", {
      jobId: result.jobId,
      connectorId: result.connectorId,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      message: result.status === "completed" ? "Sincronizacao concluida." : "Sincronizacao falhou."
    });
    return updated;
  }

  progressEvent(result: SyncResult, message: string): void {
    this.progress.emit("connector.sync.progress", {
      jobId: result.jobId,
      connectorId: result.connectorId,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      message
    });
  }
}
