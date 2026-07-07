import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dailyhealth.mobile",
  appName: "Daily Health",
  webDir: "mobile-web",
  server: {
    allowNavigation: ["127.0.0.1", "localhost"],
    cleartext: true
  },
  plugins: {
    NodeJS: {
      nodeDir: "nodejs"
    }
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
