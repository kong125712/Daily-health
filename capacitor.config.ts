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
    CapacitorSQLite: {
      androidIsEncryption: false,
      iosIsEncryption: false
    },
    CapacitorNodeJS: {
      nodeDir: "nodejs"
    },
    SystemBars: {
      insetsHandling: "css"
    }
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
