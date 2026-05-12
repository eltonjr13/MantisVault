import type { ContactInput } from "../../normalizers/contact.normalizer";

export type MobileContactsJsonImportRequest = {
  deviceId: string;
  contacts: ContactInput[];
};
