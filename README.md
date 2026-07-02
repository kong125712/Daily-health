# Daily Health

Daily Health is a local-first AI health, ingredient recognition, and recipe recommendation web app. It combines image-based ingredient recognition, optional Epicure / FlavorGraph-style pairing, AI recipe generation, and everyday health records for meals, water, exercise, sleep, and weight.

## Main Features

- Smart Scan for JPG, JPEG, PNG, and WebP ingredient or food photos up to 8MB.
- Editable recognized ingredients with English and Simplified Chinese display names.
- Recipe Ideas that generate exactly 3 recipes from scans, manual ingredients, or saved recipes.
- Optional Epicure MCP flavor pairing with safe fallback to standard AI pairing.
- Food Log, Water, Exercise, Sleep & Weight, Daily History, and My Recipes pages.
- English by default with manual Simplified Chinese switching.
- SQLite-backed persistence through Prisma, with LocalStorage only for the anonymous browser profile and immediate preferences.

## Technology Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite
- OpenAI official JavaScript SDK
- Zod validation
- Optional Epicure MCP integration

## Database Architecture

Database files live in `database/`.

- `Profile` and `AppSettings` store the anonymous local profile, locale, theme, and default water target.
- `IngredientScan` and `RecognizedIngredient` store scan history and editable ingredient results.
- `EpicurePairing` stores cleaned flavor pairing suggestions, not raw MCP responses.
- `Recipe`, `RecipeTranslation`, `RecipeIngredient`, `RecipeStep`, `RecipeTip`, and `RecipeMissingIngredient` store normalized bilingual recipes.
- `FoodLog`, `WaterEntry`, `WaterTarget`, `ExerciseLog`, `SleepLog`, and `WeightLog` store health records.
- Daily totals are calculated from records instead of stored redundantly.

SQLite is used because this app has no login system and is designed to run locally with simple setup. Prisma gives type-safe server-side database access, migrations, indexes, unique constraints, and relational data modeling without requiring an external paid database.

## AI and Epicure

OpenAI or Gemini image analysis recognizes visible ingredients and food. Recipe generation creates structured bilingual recipes from ingredients, pairing suggestions, and user preferences.

Epicure / FlavorGraph pairing uses `EPICURE_MCP_URL`, which defaults to `https://epicure-mcp.kaikaku.ai/mcp`. If Epicure is unavailable, recipe generation still works and the app shows a non-blocking fallback message.

Recipe calories are not trusted from the text-generation model. After recipes are generated, the server tries Epicure nutrition/calorie tools first, then falls back to a deterministic ingredient-amount calculation so the displayed per-serving calories come from structured data and math rather than free-form AI guesses.

## Installation

```bash
npm install
npx prisma generate --schema database/schema.prisma
npx prisma migrate dev --schema database/schema.prisma
npm run dev
```

Open the local URL printed by Next.js.

## Environment

Create `.env.local` in the project root:

```env
DATABASE_URL="file:./daily-health.db"
AI_PROVIDER=
OPENAI_API_KEY=
GEMINI_API_KEY=
EPICURE_MCP_URL=https://epicure-mcp.kaikaku.ai/mcp
```

`DATABASE_URL="file:./daily-health.db"` creates `database/daily-health.db` because the Prisma schema is inside the `database` folder.

Set `AI_PROVIDER` as `openai` OR `gemini` to select the ai provider.

Set `OPENAI_API_KEY` OR `GEMINI_API_KEY` to enable Smart Scan and recipe generation. Without it, the app shows a friendly setup message instead of exposing technical details.

`EPICURE_MCP_URL` defaults to the hosted Epicure MCP endpoint above. Override it only if you want to use another Epicure MCP service.

## Commands

```bash
npx prisma generate --schema database/schema.prisma
npx prisma migrate dev --schema database/schema.prisma
npm run dev
npm run lint
npm run build
```

## Fast set up guidance
[Setup Guide](./Daily%20Health%20Setup.md)

## Android APK Packaging

Daily Health can be packaged as an Android WebView client through Capacitor:

```bash
npm run mobile:sync
npm run mobile:apk
```

The generated debug APK is written by Gradle to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For this workspace, a built installable debug APK has also been copied to:

```text
outputs/DailyHealth-debug.apk
```

Important mobile behavior:

- The APK is a mobile client for Daily Health.
- Because the app uses Next.js API routes, Prisma/SQLite, OpenAI server-side keys, and optional Epicure MCP server-side calls, the phone app must connect to a running Daily Health server.
- On first launch, the APK shows a server URL screen. Enter a reachable URL such as `http://192.168.1.20:3000` for same-Wi-Fi testing, or a production HTTPS URL after deployment.
- Do not enter the GitHub repository URL in the APK. GitHub shows source code pages and does not run the app API routes.
- To bake a fixed server URL into the native wrapper before syncing, run Capacitor with `MOBILE_SERVER_URL` set, then rebuild the APK.

Example on Windows PowerShell:

```powershell
$env:MOBILE_SERVER_URL="https://your-domain.com"
npm run mobile:sync
npm run mobile:apk
```

## GitHub APK Releases

The repository includes a manual GitHub Actions workflow named `Android APK Release`.

- It can only run from `workflow_dispatch`.
- The build job exits unless the trigger actor is the repository owner.
- It publishes a GitHub Release containing a debug APK, release APK, source code ZIP, and SHA256 checksums.
- If Android signing secrets are not configured, the workflow generates a temporary CI keystore so the release APK is still installable.

For stable production signing, add these repository secrets before running the workflow:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

`ANDROID_KEY_PASSWORD` is optional when it matches `ANDROID_KEYSTORE_PASSWORD`.

## Data Storage and Privacy

Important health, recipe, recognition, and history data is stored in local SQLite through Prisma. Browser LocalStorage stores only lightweight device-specific values: the anonymous profile ID, selected locale, and selected theme. API keys and database URLs are server-side only and are never sent to client components.

Original uploaded food images are not permanently stored by default. Scan records store only image metadata and recognized ingredient data.

## Language Switching

English is the default language on first launch. The language switcher in navigation and settings offers `EN` and `中文`. The selected locale is saved immediately in LocalStorage/cookie for fast loading and persisted in the database through `AppSettings.locale`.

AI recognition and recipe generation requests include the active locale. Recipes store English and Simplified Chinese translations when available; if one language is missing, the app displays the existing content instead of an empty field. User-written notes are not automatically translated.

## Disclaimer

English:
This application is for everyday health tracking, ingredient recognition, and recipe inspiration only. It does not provide medical diagnosis, treatment, dietary prescriptions, or personalized medical advice. Ingredient recognition, recipe suggestions, and calorie estimates may be inaccurate. Please consider actual ingredients, portions, allergies, and personal needs.

## License

MIT License. See [LICENSE](LICENSE).

简体中文:
本应用仅用于日常健康记录、食材识别和菜谱灵感参考，不提供医疗诊断、治疗、饮食处方或个性化医疗建议。食材识别、菜谱建议和热量估算可能存在误差，请根据实际食材、份量、过敏情况和个人需求自行判断。
