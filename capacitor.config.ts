import type { CapacitorConfig } from "@capacitor/cli";

// Must match the port scripts/mobile-prepare.js injects into mobile-web/index.html.
// The embedded server is intentionally HTTP-only and loopback-only. On Android,
// Capacitor converts allowNavigation entries without a scheme into HTTPS rules,
// so the exact HTTP origin and port must be listed explicitly.
const embeddedServerPort = process.env.DAILY_HEALTH_MOBILE_PORT || "34189";
const embeddedNavigationOrigins = [
  "127.0.0.1",
  `127.0.0.1:${embeddedServerPort}`,
  `http://127.0.0.1:${embeddedServerPort}`,
  "localhost",
  `localhost:${embeddedServerPort}`,
  `http://localhost:${embeddedServerPort}`
];

const config: CapacitorConfig = {
  appId: "com.dailyhealth.mobile",
  appName: "Daily Health",
  webDir: "mobile-web",
  server: {
    allowNavigation: embeddedNavigationOrigins,
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
    allowMixedContent: true,
    // This app only navigates to its loopback server. The legacy bridge keeps
    // native plugins available on that HTTP origin after the boot redirect.
    useLegacyBridge: true
  }
};

export default config;
