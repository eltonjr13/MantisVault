import { safeTitle } from "../utils/safe-metadata";

export type CalendarEventInput = {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  location?: string;
};

export class CalendarNormalizer {
  parseIcs(buffer: Buffer): Array<{ sourceId: string; title: string; metadata: Record<string, unknown> }> {
    const text = buffer.toString("utf8");
    return text
      .split(/END:VEVENT/i)
      .map((entry, index) => normalizeIcsEntry(entry, index))
      .filter((entry): entry is { sourceId: string; title: string; metadata: Record<string, unknown> } => Boolean(entry));
  }

  normalizeJson(events: CalendarEventInput[]): Array<{ sourceId: string; title: string; metadata: Record<string, unknown> }> {
    return events.map((event, index) => ({
      sourceId: event.id ?? `calendar-event-${index}`,
      title: safeTitle(event.title, "Evento"),
      metadata: {
        title: safeTitle(event.title, "Evento"),
        start: event.start,
        end: event.end,
        locationPresent: Boolean(event.location)
      }
    }));
  }
}

function normalizeIcsEntry(entry: string, index: number): { sourceId: string; title: string; metadata: Record<string, unknown> } | undefined {
  if (!entry.includes("BEGIN:VEVENT")) {
    return undefined;
  }

  const title = readIcsValue(entry, "SUMMARY") ?? "Evento";
  const location = readIcsValue(entry, "LOCATION");

  return {
    sourceId: readIcsValue(entry, "UID") ?? `ics-event-${index}`,
    title: safeTitle(title, "Evento"),
    metadata: {
      title: safeTitle(title, "Evento"),
      start: readIcsValue(entry, "DTSTART"),
      end: readIcsValue(entry, "DTEND"),
      locationPresent: Boolean(location)
    }
  };
}

function readIcsValue(entry: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, "im");
  return entry.match(pattern)?.[1]?.trim();
}
