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
    // The embedded Node server is the first real WebView origin on Android.
    // MainActivity waits for its health check before reloading this URL, which
    // preserves Capacitor's native plugin bridge for the page lifetime.
    url: `http://127.0.0.1:${embeddedServerPort}`,
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
    // This app loads only its loopback server as the first WebView origin.
    // The legacy bridge is retained for capacitor-nodejs compatibility.
    useLegacyBridge: true
  }
};

export default config;
