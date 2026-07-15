import type { CapacitorConfig } from "@capacitor/cli";

// Must match the port scripts/mobile-prepare.js injects into mobile-web/index.html
// (DAILY_HEALTH_MOBILE_PORT, default 34189). Capacitor Android's post-navigation
// bridge/origin matching needs the port explicitly listed in allowNavigation, not
// just the bare host — see https://github.com/ionic-team/capacitor/issues/7570.
// Without it, Capacitor.getPlatform() silently reports "web" instead of "android"
// after the boot screen redirects to the embedded server, which breaks every
// native-SQLite-backed feature (profile, settings, ingredient scan, recipes, ...).
const embeddedServerPort = process.env.DAILY_HEALTH_MOBILE_PORT || "34189";

const config: CapacitorConfig = {
  appId: "com.dailyhealth.mobile",
  appName: "Daily Health",
  webDir: "mobile-web",
  server: {
    allowNavigation: [
      "127.0.0.1",
      `127.0.0.1:${embeddedServerPort}`,
      "localhost",
      `localhost:${embeddedServerPort}`
    ],
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
