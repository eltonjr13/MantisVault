import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kazento.kazvault",
  appName: "KazVault",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
