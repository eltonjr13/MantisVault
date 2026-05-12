import type { CalendarEventInput } from "../../normalizers/calendar.normalizer";

export type MobileCalendarJsonImportRequest = {
  deviceId: string;
  events: CalendarEventInput[];
};
