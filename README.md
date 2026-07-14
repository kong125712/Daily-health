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

Preferred setup uses the package manager pinned by this repository:

```bash
pnpm install
pnpm exec prisma generate --schema database/schema.prisma
pnpm exec prisma migrate dev --schema database/schema.prisma
pnpm run dev
```

`npm install` is also supported for basic local setup. The repository includes `.npmrc` with `legacy-peer-deps=true` because `capacitor-nodejs@0.0.1` declares an old Capacitor peer range even though the Android project patches and builds it with the current Capacitor app.

Open the local URL printed by Next.js.

## Environment

Create `.env.local` in the project root:

```env
DATABASE_URL="file:./daily-health.db"
AI_PROVIDER=
OPENAI_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
RECIPE_IMAGE_PROVIDER=local
REPLICATE_API_TOKEN=
REPLICATE_IMAGE_MODEL=black-forest-labs/flux-schnell
THEMEALDB_API_KEY=1
LOCAL_IMAGE_API=comfyui
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=
COMFYUI_IMAGE_WIDTH=768
COMFYUI_IMAGE_HEIGHT=576
COMFYUI_STEPS=
COMFYUI_CFG_SCALE=
COMFYUI_SAMPLER=
COMFYUI_SCHEDULER=
EPICURE_MCP_URL=https://epicure-mcp.kaikaku.ai/mcp
```

`DATABASE_URL="file:./daily-health.db"` creates `database/daily-health.db` because the Prisma schema is inside the `database` folder.

Set `AI_PROVIDER` as `openai` OR `gemini` to select the ai provider.

Set `OPENAI_API_KEY` OR `GEMINI_API_KEY` to enable Smart Scan and recipe generation. Without it, the app shows a friendly setup message instead of exposing technical details.

For Gemini text and image understanding, `GEMINI_MODEL=gemini-3.1-flash-lite` pins the app to a stable low-latency model instead of a hot-swapped `latest` alias.

Recipe reference photos first try images that users explicitly approved by binding them to a recipe, then real dish photos from TheMealDB/Wikimedia, then the configured generator. Automatic image matches are suggestions only; they become long-term shared cache entries only after a user chooses to bind the image to a recipe.

Set `RECIPE_IMAGE_PROVIDER` to `disabled`, `local`, `gemini`, or `replicate`. Use `disabled` for production modes that should never generate images, `local` for ComfyUI/SD WebUI development, `gemini` for Gemini image generation, or `replicate` for cloud FLUX-style generation with `REPLICATE_API_TOKEN` and `REPLICATE_IMAGE_MODEL`.

Standard ComfyUI often uses `http://127.0.0.1:8188`; the ComfyUI Desktop app may use `http://127.0.0.1:8000`. Set `COMFYUI_URL` to whichever `/system_stats` endpoint responds, then keep `RECIPE_IMAGE_PROVIDER=local` and `LOCAL_IMAGE_API=comfyui`. The app automatically reads the first available checkpoint unless `COMFYUI_CHECKPOINT` is set to a specific checkpoint filename.

For `flux1-schnell-fp8.safetensors`, set `COMFYUI_CHECKPOINT=flux1-schnell-fp8.safetensors`, `COMFYUI_IMAGE_WIDTH=640`, `COMFYUI_IMAGE_HEIGHT=448`, `COMFYUI_STEPS=4`, `COMFYUI_CFG_SCALE=1`, `COMFYUI_SAMPLER=euler`, and `COMFYUI_SCHEDULER=simple`. This is a good speed/quality balance for app reference images. If these tuning variables are left blank, the app chooses FLUX-friendly defaults for checkpoint names containing `flux`, and keeps SDXL-friendly defaults for normal SDXL checkpoints.

Set `RECIPE_IMAGE_PROVIDER=gemini` only if you want Gemini to generate recipe reference photos instead of local ComfyUI. `GEMINI_IMAGE_MODEL` chooses the Gemini image model for that mode.

`EPICURE_MCP_URL` defaults to the hosted Epicure MCP endpoint above. Override it only if you want to use another Epicure MCP service.

## Commands

```bash
pnpm exec prisma generate --schema database/schema.prisma
pnpm exec prisma migrate dev --schema database/schema.prisma
pnpm run dev
pnpm run lint
pnpm run build
```

## Fast set up guidance
[Setup Guide](./Daily%20Health%20Setup.md)

## Android APK Packaging

Daily Health can be packaged as an Android APK through Capacitor. The APK includes the Capacitor WebView plus an embedded Node.js process that runs the Next.js standalone server locally on the phone.

```bash
pnpm run build
pnpm run mobile:prepare
pnpm run mobile:sync
cd android
gradlew assembleDebug
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

- The APK starts a local server at `http://127.0.0.1:34189` inside the app sandbox.
- The first mobile screen waits for that local server, then opens Daily Health in the WebView.
- SQLite data is copied from a bundled clean template into a writable persistent app data directory on first launch.
- AI features still need API keys or a configured local/cloud provider. The in-app setup/status pages should be used to confirm what is configured.
- `capacitor-nodejs` is old and only used as a compatibility bridge for the embedded Node runtime. The build scripts include checks so an APK is not released if the embedded `.next`, `node_modules`, SQLite template, or native Node libraries are missing.

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

## Some tricky problem faced during packaging to android
[Pitfalls](./PITFALLS.md)

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
