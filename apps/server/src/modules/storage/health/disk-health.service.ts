import { execFile } from "node:child_process";
import { parse } from "node:path";
import { promisify } from "node:util";
import type { DiskHardwareHealth, DiskHardwareHealthStatus, DiskHealthReport } from "../storage.types";

const execFileAsync = promisify(execFile);

type RawWindowsStorageDisk = {
  deviceId?: unknown;
  friendlyName?: unknown;
  serialNumber?: unknown;
  mediaType?: unknown;
  busType?: unknown;
  sizeBytes?: unknown;
  healthStatus?: unknown;
  operationalStatus?: unknown;
  driveLetters?: unknown;
};

type RawWin32Disk = {
  deviceId?: unknown;
  index?: unknown;
  model?: unknown;
  serialNumber?: unknown;
  mediaType?: unknown;
  sizeBytes?: unknown;
  status?: unknown;
  driveLetters?: unknown;
};

export interface DiskHealthReader {
  checkAll(): Promise<DiskHealthReport>;
}

export class DiskHealthService implements DiskHealthReader {
  async checkAll(): Promise<DiskHealthReport> {
    const checkedAt = new Date().toISOString();

    if (process.platform !== "win32") {
      return {
        supported: false,
        checkedAt,
        source: "unsupported",
        disks: [],
        warnings: ["Diagnostico fisico de disco disponivel apenas no Windows nesta versao."]
      };
    }

    try {
      const rawDisks = await runPowerShellJson<RawWindowsStorageDisk>(WINDOWS_STORAGE_HEALTH_SCRIPT);

      return {
        supported: true,
        checkedAt,
        source: "windows-storage",
        disks: rawDisks.map((disk, index) => normalizeWindowsStorageDisk(disk, index, checkedAt)),
        warnings: rawDisks.length === 0 ? ["Nenhum disco fisico foi retornado pelo Windows Storage."] : []
      };
    } catch (error) {
      const storageError = error instanceof Error ? error.message : String(error);

      try {
        const rawDisks = await runPowerShellJson<RawWin32Disk>(WIN32_DISK_HEALTH_SCRIPT);

        return {
          supported: true,
          checkedAt,
          source: "win32-diskdrive",
          disks: rawDisks.map((disk, index) => normalizeWin32Disk(disk, index, checkedAt)),
          warnings: [
            `Leitura SMART detalhada indisponivel; usando status basico do Windows. Motivo: ${storageError}`
          ]
        };
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        return {
          supported: false,
          checkedAt,
          source: "unsupported",
          disks: [],
          warnings: [`Nao foi possivel ler a saude fisica do disco: ${message}`]
        };
      }
    }
  }

  async checkPath(rootPath: string): Promise<DiskHardwareHealth | undefined> {
    const report = await this.checkAll();
    return findDiskForPath(rootPath, report);
  }
}

export function findDiskForPath(rootPath: string, report: DiskHealthReport): DiskHardwareHealth | undefined {
  const driveLetter = getDriveLetter(rootPath);

  if (!driveLetter) {
    return undefined;
  }

  return report.disks.find((disk) => disk.driveLetters.some((letter) => letter.toUpperCase() === driveLetter));
}

function normalizeWindowsStorageDisk(raw: RawWindowsStorageDisk, index: number, checkedAt: string): DiskHardwareHealth {
  const health = mapWindowsHealth(raw.healthStatus);
  const deviceId = toStringValue(raw.deviceId);
  const label = toStringValue(raw.friendlyName) ?? `Disco ${deviceId ?? index + 1}`;
  const serialNumber = toStringValue(raw.serialNumber);

  return {
    id: deviceId ? `physical:${deviceId}` : `physical:${serialNumber ?? index}`,
    label,
    model: label,
    serialNumber,
    mediaType: mapMediaType(raw.mediaType),
    busType: mapBusType(raw.busType),
    sizeBytes: toNumber(raw.sizeBytes),
    status: health.status,
    statusLabel: health.label,
    operationalStatus: toValueArray(raw.operationalStatus).map(mapOperationalStatus),
    driveLetters: toDriveLetters(raw.driveLetters),
    source: "windows-storage",
    checkedAt
  };
}

function normalizeWin32Disk(raw: RawWin32Disk, index: number, checkedAt: string): DiskHardwareHealth {
  const statusText = toStringValue(raw.status);
  const status = mapWin32Status(statusText);
  const deviceId = toStringValue(raw.deviceId) ?? toStringValue(raw.index);
  const model = toStringValue(raw.model);

  return {
    id: deviceId ? `win32:${deviceId}` : `win32:${index}`,
    label: model ?? `Disco ${index + 1}`,
    model,
    serialNumber: toStringValue(raw.serialNumber),
    mediaType: toStringValue(raw.mediaType),
    sizeBytes: toNumber(raw.sizeBytes),
    status,
    statusLabel: statusText ?? "Unknown",
    operationalStatus: statusText ? [statusText] : [],
    driveLetters: toDriveLetters(raw.driveLetters),
    source: "win32-diskdrive",
    checkedAt,
    warning: "Status basico do Windows. Instale ou habilite o provedor Storage para detalhes SMART."
  };
}

async function runPowerShellJson<T>(script: string): Promise<T[]> {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      timeout: 8_000,
      maxBuffer: 1024 * 1024
    }
  );
  const output = String(stdout).trim();
  const errorOutput = String(stderr).trim();

  if (errorOutput) {
    throw new Error(errorOutput);
  }

  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
}

function getDriveLetter(rootPath: string): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  const root = parse(rootPath).root;
  const match = /^([a-z]):\\/i.exec(root);
  return match ? `${match[1].toUpperCase()}:` : undefined;
}

function mapWindowsHealth(value: unknown): { status: DiskHardwareHealthStatus; label: string } {
  const number = toNumber(value);

  switch (number) {
    case 0:
      return { status: "healthy", label: "Healthy" };
    case 1:
      return { status: "warning", label: "Warning" };
    case 2:
      return { status: "critical", label: "Unhealthy" };
    case 5:
      return { status: "unknown", label: "Unknown" };
  }

  const text = toStringValue(value);
  const normalized = text?.toLowerCase() ?? "";

  if (normalized === "healthy" || normalized === "ok") {
    return { status: "healthy", label: text ?? "Healthy" };
  }

  if (normalized.includes("warning") || normalized.includes("predictive")) {
    return { status: "warning", label: text ?? "Warning" };
  }

  if (normalized.includes("unhealthy") || normalized.includes("critical") || normalized.includes("fail")) {
    return { status: "critical", label: text ?? "Unhealthy" };
  }

  return { status: "unknown", label: text ?? "Unknown" };
}

function mapMediaType(value: unknown): string | undefined {
  const number = toNumber(value);

  switch (number) {
    case 3:
      return "HDD";
    case 4:
      return "SSD";
    case 5:
      return "SCM";
    case 0:
      return "Unspecified";
  }

  return toStringValue(value);
}

function mapBusType(value: unknown): string | undefined {
  const number = toNumber(value);
  const labels: Record<number, string> = {
    0: "Unknown",
    1: "SCSI",
    2: "ATAPI",
    3: "ATA",
    4: "IEEE 1394",
    5: "SSA",
    6: "Fibre Channel",
    7: "USB",
    8: "RAID",
    9: "iSCSI",
    10: "SAS",
    11: "SATA",
    12: "SD",
    13: "MMC",
    14: "Virtual",
    15: "File Backed Virtual",
    16: "Storage Spaces",
    17: "NVMe"
  };

  if (number === undefined) {
    return toStringValue(value);
  }

  return labels[number] ?? `Unknown (${number})`;
}

function mapOperationalStatus(value: unknown): string {
  const number = toNumber(value);

  if (number === undefined) {
    return toStringValue(value) ?? "Unknown";
  }

  const labels: Record<number, string> = {
    0: "Unknown",
    1: "Other",
    2: "OK",
    3: "Degraded",
    4: "Stressed",
    5: "Predictive Failure",
    6: "Error",
    7: "Non-Recoverable Error",
    8: "Starting",
    9: "Stopping",
    10: "Stopped",
    11: "In Service",
    12: "No Contact",
    13: "Lost Communication",
    14: "Aborted",
    15: "Dormant",
    16: "Supporting Entity in Error",
    17: "Completed",
    18: "Power Mode",
    0x8000: "Offline",
    0x8001: "Not Ready",
    0x8002: "No Media",
    0x8004: "Predictive Failure"
  };

  return labels[number] ?? `Unknown (${number})`;
}

function mapWin32Status(value: string | undefined): DiskHardwareHealthStatus {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized === "ok") {
    return "healthy";
  }

  if (normalized.includes("pred") || normalized.includes("degrad")) {
    return "warning";
  }

  if (normalized.includes("error") || normalized.includes("fail")) {
    return "critical";
  }

  return "unknown";
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function toNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toValueArray(value: unknown): unknown[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values;
}

function toDriveLetters(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const letters = values
    .map(toStringValue)
    .filter((item): item is string => item !== undefined)
    .map((item) => item.replace(/\\+$/g, "").toUpperCase())
    .filter((item) => /^[A-Z]:$/.test(item));

  return [...new Set(letters)];
}

const DRIVE_MAP_SCRIPT = `
$volumeMap = @{}
try {
  $partitions = @(Get-Partition | Where-Object { $_.DriveLetter })
  foreach ($partition in $partitions) {
    $diskNumber = "$($partition.DiskNumber)".Trim()
    if ($diskNumber) {
      $existing = @()
      if ($volumeMap.ContainsKey($diskNumber)) {
        $existing = @($volumeMap[$diskNumber])
      }
      $next = @($existing + "$($partition.DriveLetter):")
      $volumeMap[$diskNumber] = @($next | Sort-Object -Unique)
    }
  }
} catch {}
`;

const WINDOWS_STORAGE_HEALTH_SCRIPT = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
${DRIVE_MAP_SCRIPT}
$physicalDisks = @(Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_PhysicalDisk)
$result = foreach ($disk in $physicalDisks) {
  $deviceId = "$($disk.DeviceId)".Trim()
  $serialNumber = "$($disk.SerialNumber)".Trim()
  $letters = @()
  if ($deviceId -and $volumeMap.ContainsKey($deviceId)) {
    $letters = $volumeMap[$deviceId]
  } elseif ($serialNumber -and $volumeMap.ContainsKey($serialNumber)) {
    $letters = $volumeMap[$serialNumber]
  }

  [PSCustomObject]@{
    deviceId = $deviceId
    friendlyName = $disk.FriendlyName
    serialNumber = $serialNumber
    mediaType = $disk.MediaType
    busType = $disk.BusType
    sizeBytes = [double]$disk.Size
    healthStatus = $disk.HealthStatus
    operationalStatus = @($disk.OperationalStatus)
    driveLetters = @($letters)
  }
}
ConvertTo-Json -InputObject @($result) -Depth 6 -Compress
`;

const WIN32_DISK_HEALTH_SCRIPT = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
${DRIVE_MAP_SCRIPT}
$diskDrives = @(Get-CimInstance -ClassName Win32_DiskDrive)
$result = foreach ($drive in $diskDrives) {
  $index = "$($drive.Index)".Trim()
  $letters = if ($index -and $volumeMap.ContainsKey($index)) { $volumeMap[$index] } else { @() }

  [PSCustomObject]@{
    deviceId = $drive.DeviceID
    index = $index
    model = $drive.Model
    serialNumber = "$($drive.SerialNumber)".Trim()
    mediaType = $drive.MediaType
    sizeBytes = [double]$drive.Size
    status = $drive.Status
    driveLetters = @($letters)
  }
}
ConvertTo-Json -InputObject @($result) -Depth 6 -Compress
`;
