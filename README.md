# Daily Health v2

Daily Health v2 is an Expo application for Android and the web. It replaces
the old embedded Node/WebView architecture with direct React Native calls:

- Free local mode stores health records in `expo-sqlite` on the device and
  calls Gemini or OpenAI with the user’s own key.
- Subscribed mode uses the independently deployed `server/` API, email login,
  a Bearer session, and a cloud database.
- Subscribed users can opt into a server-first SQLite mirror on native.
- Web is cloud-only and has no browser health-data database.

There is no Capacitor, embedded Node.js server, port synchronization, CORS
bridge, or Prisma engine in the application bundle.

## Run the mobile app

```sh
pnpm install
pnpm mobile
```

For Android development use `a` in Expo’s terminal, or run:

```sh
pnpm --filter @daily-health/mobile android
```

For a static web export:

```sh
pnpm mobile:web
```

Set `EXPO_PUBLIC_API_BASE_URL` in the mobile build environment before using
cloud mode. Local mode works without this value.

## Run the cloud API

```sh
cp server/.env.example server/.env
pnpm server
```

The server uses libSQL/SQLite, not Prisma. For production, point
`DATABASE_URL` at hosted libSQL/Turso, set `DATABASE_AUTH_TOKEN`, a strong
`AUTH_JWT_SECRET`, and exact `ALLOWED_ORIGINS`. See [server/README.md](server/README.md).

## Release APK

The `Android APK Release` GitHub Action runs Expo prebuild, Gradle, version
injection, and `aapt` validation. It rejects any APK containing Capacitor,
Node, or Prisma artifacts.

## Verification

```sh
pnpm mobile:typecheck
pnpm server:typecheck
pnpm --filter @daily-health/mobile export:web
pnpm --filter @daily-health/mobile exec expo export --platform android
```

## Disclaimer

Daily Health is for everyday tracking, ingredient recognition, and recipe
inspiration. It is not medical diagnosis, treatment, dietary prescription, or
personalized medical advice. Confirm ingredients, portions, allergies, and
health decisions independently.
