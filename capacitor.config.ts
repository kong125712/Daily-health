import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dailyhealth.mobile",
  appName: "Daily Health",
  webDir: "mobile-web",
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
    allowMixedContent: true,
    // Keep the WebView on Capacitor's built-in https://localhost origin.
    // MainActivity proxies that origin to the embedded loopback server after
    // it is healthy, so native plugins remain attached to every page.
    useLegacyBridge: true
  }
};

export default config;
