"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { generateFallbackRecipes } from "@/lib/services/fallbackRecipeService";
import {
  estimateFoodNutritionWithGeminiImpl,
  generateRecipesWithGeminiImpl,
  recognizeIngredientsWithGeminiImpl
} from "@/lib/services/geminiImpl";
import { buildCalorieGuidance } from "@/lib/services/calorieTargets";
import { buildNutritionSummary } from "@/lib/services/nutritionStructure";
import type {
  AppLocale,
  AppErrorLogView,
  AvoidRecipeInput,
  DailyHistoryView,
  EpicurePairingInput,
  ExerciseLogView,
  FoodLogView,
  IngredientScanView,
  MealCategory,
  RecognizedIngredientInput,
  RecipePreferenceInput,
  RecipeReferenceImageView,
  RecipeView,
  SleepLogView,
  ThemeMode,
  UserProfileView,
  WaterSummary,
  WeightLogView
} from "@/lib/types/domain";

type MobileApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  profileId?: string | null;
  locale?: AppLocale;
};

type SqliteRow = Record<string, unknown>;

type SqlitePlugin = {
  createConnection(options: Record<string, unknown>): Promise<void>;
  open(options: Record<string, unknown>): Promise<void>;
  execute(options: Record<string, unknown>): Promise<unknown>;
  run(options: Record<string, unknown>): Promise<unknown>;
  query(options: Record<string, unknown>): Promise<{ values?: SqliteRow[] }>;
};

type LocalSettings = {
  locale: AppLocale;
  theme: ThemeMode;
  defaultWaterTargetMl: number;
  aiProvider: "gemini" | "openai";
  geminiApiKey: string | null;
  openaiApiKey: string | null;
};

type StoredRecord<T> = {
  id: string;
  profileId: string;
  date: string | null;
  data: T;
  createdAt: string;
  updatedAt: string;
};

const databaseName = "daily_health";
const sqlite = registerPlugin<SqlitePlugin>("CapacitorSQLite");
let readyPromise: Promise<void> | null = null;

export class MobileApiError extends Error {
  statusCode: number;
  data: unknown;

  constructor(message: string, statusCode: number, data: unknown = null) {
    super(message);
    this.name = "MobileApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

export function usesNativeMobileDatabase() {
  return Capacitor.isNativePlatform() && ["android", "ios"].includes(Capacitor.getPlatform());
}

function now() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(12));
    return `${prefix}_${Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("")}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function apiPath(path: string) {
  return new URL(path, "https://daily-health.local");
}

function epicureBridgeUrl() {
  const appUrl = new URL(window.location.href);
  const appPort = Number(appUrl.port || "34189");
  return `http://127.0.0.1:${appPort + 1}/epicure-pairings`;
}

async function mobileEpicurePairings(input: {
  ingredients: RecognizedIngredientInput[];
  preferences: RecipePreferenceInput;
}): Promise<{ status: "connected" | "failed"; pairings: EpicurePairingInput[] }> {
  try {
    const response = await fetch(epicureBridgeUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Epicure bridge returned ${response.status}.`);
    }
    const result = asObject(await response.json());
    const rawPairings = Array.isArray(result.pairings) ? result.pairings : [];
    const pairings = rawPairings.flatMap((item) => {
      const pairing = asObject(item);
      const sourceIngredient = asText(pairing.sourceIngredient);
      const suggestedIngredient = asText(pairing.suggestedIngredient);
      if (!sourceIngredient || !suggestedIngredient) return [];
      return [{
        sourceIngredient,
        suggestedIngredient,
        score: asNumber(pairing.score) ?? undefined,
        category: asText(pairing.category) || undefined,
        reasonEn: asText(pairing.reasonEn, `${suggestedIngredient} may pair well with ${sourceIngredient}.`),
        reasonZh: asText(pairing.reasonZh, `${suggestedIngredient} can be used as a flavor pairing reference.`)
      }];
    });
    return { status: result.status === "connected" ? "connected" : "failed", pairings };
  } catch {
    return { status: "failed", pairings: [] };
  }
}

function recordDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function defaultSettings(): LocalSettings {
  return {
    locale: "en",
    theme: "light",
    defaultWaterTargetMl: 2000,
    aiProvider: "gemini",
    geminiApiKey: null,
    openaiApiKey: null
  };
}

function defaultProfile(profileId: string): UserProfileView {
  const createdAt = now();
  return {
    id: profileId,
    displayName: null,
    gender: null,
    birthYear: null,
    heightCm: null,
    weightKg: null,
    activityLevel: "sedentary",
    calorieGoal: "maintain",
    dailyCalorieTarget: null,
    createdAt,
    updatedAt: createdAt
  };
}

async function execute(statements: string) {
  await sqlite.execute({ database: databaseName, statements, transaction: true, readonly: false });
}

async function run(statement: string, values: unknown[] = []) {
  await sqlite.run({ database: databaseName, statement, values, transaction: true, readonly: false });
}

async function query(statement: string, values: unknown[] = []) {
  const result = await sqlite.query({ database: databaseName, statement, values, readonly: false });
  return result.values ?? [];
}

async function ensureDatabase() {
  if (!usesNativeMobileDatabase()) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await sqlite.createConnection({
          database: databaseName,
          version: 1,
          encrypted: false,
          mode: "no-encryption",
          readonly: false
        });
      } catch {
        // Opening an already-created connection is expected after a WebView resume.
      }
      try {
        await sqlite.open({ database: databaseName, readonly: false });
      } catch {
        // The native plugin keeps an open connection for the WebView lifetime.
      }
      await execute(`
        CREATE TABLE IF NOT EXISTS health_records (
          record_type TEXT NOT NULL,
          record_id TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          record_date TEXT,
          data_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (record_type, record_id)
        );
        CREATE INDEX IF NOT EXISTS health_records_profile_type_date
          ON health_records (profile_id, record_type, record_date);
        CREATE INDEX IF NOT EXISTS health_records_profile_type_created
          ON health_records (profile_id, record_type, created_at);
      `);
    })();
  }
  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    const message = error instanceof Error ? error.message : "Unable to open the device database.";
    throw new MobileApiError(message, 503);
  }
}

function parseStored<T>(row: SqliteRow): StoredRecord<T> | null {
  const id = asText(row.record_id);
  const profileId = asText(row.profile_id);
  const serialized = asText(row.data_json);
  if (!id || !profileId || !serialized) return null;
  try {
    return {
      id,
      profileId,
      date: recordDate(asText(row.record_date)) ?? null,
      data: JSON.parse(serialized) as T,
      createdAt: asText(row.created_at),
      updatedAt: asText(row.updated_at)
    };
  } catch {
    return null;
  }
}

async function getRecord<T>(type: string, profileId: string, id: string) {
  const rows = await query(
    "SELECT record_id, profile_id, record_date, data_json, created_at, updated_at FROM health_records WHERE record_type = ? AND profile_id = ? AND record_id = ? LIMIT 1",
    [type, profileId, id]
  );
  return rows.map(parseStored<T>).find((record): record is StoredRecord<T> => Boolean(record)) ?? null;
}

async function listRecords<T>(type: string, profileId: string, date?: string | null) {
  const rows = date
    ? await query(
      "SELECT record_id, profile_id, record_date, data_json, created_at, updated_at FROM health_records WHERE record_type = ? AND profile_id = ? AND record_date = ? ORDER BY created_at ASC",
      [type, profileId, date]
    )
    : await query(
      "SELECT record_id, profile_id, record_date, data_json, created_at, updated_at FROM health_records WHERE record_type = ? AND profile_id = ? ORDER BY created_at ASC",
      [type, profileId]
    );
  return rows.map(parseStored<T>).filter((record): record is StoredRecord<T> => Boolean(record));
}

type MobileBackupRecord = {
  type: string;
  id: string;
  date: string | null;
  data: unknown;
  createdAt: string;
};

async function backupRecords(profileId: string): Promise<MobileBackupRecord[]> {
  const rows = await query(
    "SELECT record_type, record_id, record_date, data_json, created_at FROM health_records WHERE profile_id = ? ORDER BY created_at ASC",
    [profileId]
  );
  return rows.flatMap((row) => {
    const type = asText(row.record_type);
    const id = asText(row.record_id);
    const dataJson = asText(row.data_json);
    if (!type || !id || !dataJson) return [];
    try {
      return [{ type, id, date: recordDate(asText(row.record_date)) ?? null, data: JSON.parse(dataJson) as unknown, createdAt: asText(row.created_at) }];
    } catch {
      return [];
    }
  });
}

async function saveRecord<T>(type: string, profileId: string, id: string, data: T, date: string | null = null, createdAt = now()) {
  const updatedAt = now();
  await run(
    `INSERT INTO health_records (record_type, record_id, profile_id, record_date, data_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(record_type, record_id) DO UPDATE SET
       profile_id = excluded.profile_id,
       record_date = excluded.record_date,
       data_json = excluded.data_json,
       updated_at = excluded.updated_at`,
    [type, id, profileId, date, JSON.stringify(data), createdAt, updatedAt]
  );
  return { id, profileId, date, data, createdAt, updatedAt } satisfies StoredRecord<T>;
}

async function deleteRecord(type: string, profileId: string, id: string) {
  const found = await getRecord(type, profileId, id);
  if (!found) return false;
  await run("DELETE FROM health_records WHERE record_type = ? AND record_id = ?", [type, id]);
  return true;
}

async function ensureProfile(profileId: string) {
  let profileRecord = await getRecord<UserProfileView>("profile", profileId, profileId);
  if (!profileRecord) {
    profileRecord = await saveRecord("profile", profileId, profileId, defaultProfile(profileId));
  }
  let settingsRecord = await getRecord<LocalSettings>("settings", profileId, profileId);
  if (!settingsRecord) {
    settingsRecord = await saveRecord("settings", profileId, profileId, defaultSettings());
  }
  return { profile: profileRecord.data, settings: settingsRecord.data };
}

async function updateProfile(profileId: string, input: Record<string, unknown>) {
  const { profile } = await ensureProfile(profileId);
  const updated: UserProfileView = {
    ...profile,
    displayName: asText(input.displayName).trim() || null,
    gender: input.gender === "male" || input.gender === "female" || input.gender === "other" ? input.gender : null,
    birthYear: asNumber(input.birthYear),
    heightCm: asNumber(input.heightCm),
    weightKg: asNumber(input.weightKg),
    activityLevel: input.activityLevel === "light" || input.activityLevel === "moderate" || input.activityLevel === "active" || input.activityLevel === "very_active" ? input.activityLevel : "sedentary",
    calorieGoal: input.calorieGoal === "lose" || input.calorieGoal === "gain" ? input.calorieGoal : "maintain",
    dailyCalorieTarget: asNumber(input.dailyCalorieTarget),
    updatedAt: now()
  };
  await saveRecord("profile", profileId, profileId, updated, null, profile.createdAt);
  return updated;
}

async function updateSettings(profileId: string, input: Record<string, unknown>) {
  const { settings } = await ensureProfile(profileId);
  const updated: LocalSettings = {
    ...settings,
    locale: input.locale === "zh-CN" ? "zh-CN" : input.locale === "en" ? "en" : settings.locale,
    theme: input.theme === "dark" || input.theme === "system" || input.theme === "light" ? input.theme : settings.theme,
    defaultWaterTargetMl: asNumber(input.defaultWaterTargetMl, settings.defaultWaterTargetMl) ?? settings.defaultWaterTargetMl
  };
  await saveRecord("settings", profileId, profileId, updated);
  return updated;
}

function publicSettings(settings: LocalSettings) {
  return {
    locale: settings.locale,
    theme: settings.theme,
    defaultWaterTargetMl: settings.defaultWaterTargetMl
  };
}

function aiSettings(settings: LocalSettings) {
  const provider = settings.aiProvider;
  const geminiConfigured = Boolean(settings.geminiApiKey);
  const openaiConfigured = Boolean(settings.openaiApiKey);
  return {
    provider,
    model: provider === "gemini" ? "gemini-2.0-flash" : "gpt-4.1-mini",
    configured: provider === "gemini" ? geminiConfigured : openaiConfigured,
    profileKeyConfigured: provider === "gemini" ? geminiConfigured : openaiConfigured,
    environmentKeyConfigured: false,
    providers: {
      gemini: { configured: geminiConfigured, profileKeyConfigured: geminiConfigured },
      openai: { configured: openaiConfigured, profileKeyConfigured: openaiConfigured }
    }
  };
}

function asMealCategory(value: unknown): MealCategory {
  return value === "breakfast" || value === "lunch" || value === "dinner" ? value : "snack";
}

function sortByCreatedAt<T extends { createdAt: string }>(records: T[]) {
  return [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function waterSummary(profileId: string, date: string): Promise<WaterSummary> {
  const { settings } = await ensureProfile(profileId);
  const entries = sortByCreatedAt((await listRecords<WaterSummary["entries"][number]>("water-entry", profileId, date)).map((record) => record.data));
  const targetRecord = await getRecord<{ targetMl: number }>("water-target", profileId, `${profileId}:${date}`);
  return {
    date,
    entries,
    totalMl: entries.reduce((total, entry) => total + entry.amountMl, 0),
    targetMl: targetRecord?.data.targetMl ?? settings.defaultWaterTargetMl
  };
}

async function foodLogs(profileId: string, date: string) {
  return sortByCreatedAt((await listRecords<FoodLogView>("food-log", profileId, date)).map((record) => record.data));
}

async function exerciseLogs(profileId: string, date: string) {
  return sortByCreatedAt((await listRecords<ExerciseLogView>("exercise", profileId, date)).map((record) => record.data));
}

async function sleepLog(profileId: string, date?: string, latest = false) {
  const logs = await listRecords<SleepLogView>("sleep", profileId, date);
  if (latest) return [...logs].sort((left, right) => right.data.date.localeCompare(left.data.date))[0]?.data ?? null;
  return logs[0]?.data ?? null;
}

async function weightLog(profileId: string, date?: string, latest = false) {
  const logs = await listRecords<WeightLogView>("weight", profileId, date);
  if (latest) return [...logs].sort((left, right) => right.data.date.localeCompare(left.data.date))[0]?.data ?? null;
  return logs[0]?.data ?? null;
}

async function dailyHistory(profileId: string, date: string): Promise<DailyHistoryView> {
  const [logs, water, exercise, sleep, weight, scans, recipes] = await Promise.all([
    foodLogs(profileId, date),
    waterSummary(profileId, date),
    exerciseLogs(profileId, date),
    sleepLog(profileId, date),
    weightLog(profileId, date),
    listRecords<IngredientScanView>("scan", profileId),
    listRecords<RecipeView>("recipe", profileId)
  ]);
  const scansForDate = scans.map((record) => record.data).filter((scan) => scan.createdAt.slice(0, 10) === date);
  const recipesForDate = recipes.map((record) => record.data).filter((recipe) => recipe.createdAt.slice(0, 10) === date);
  return {
    date,
    foodLogs: logs,
    dailyCalories: logs.reduce((total, log) => total + (log.calories ?? 0), 0),
    water,
    exerciseLogs: exercise,
    exerciseMinutes: exercise.reduce((total, log) => total + log.durationMinutes, 0),
    sleep,
    weight,
    scans: scansForDate,
    recipes: recipesForDate
  };
}

function savedRecipe(profileId: string, sourceScanId: string | null, input: ReturnType<typeof generateFallbackRecipes>[number]): RecipeView {
  const createdAt = now();
  const recipeId = newId("recipe");
  return {
    id: recipeId,
    profileId,
    sourceScanId,
    cuisineStyle: input.cuisineStyle,
    difficulty: input.difficulty,
    referenceImageQuery: input.referenceImageQuery ?? null,
    referenceImage: null,
    estimatedCookingMinutes: input.estimatedCookingMinutes,
    servings: input.servings,
    estimatedCaloriesPerServing: input.estimatedCaloriesPerServing ?? null,
    estimatedProteinGramsPerServing: input.estimatedProteinGramsPerServing ?? null,
    estimatedCarbsGramsPerServing: input.estimatedCarbsGramsPerServing ?? null,
    estimatedFatGramsPerServing: input.estimatedFatGramsPerServing ?? null,
    isFavorite: false,
    createdAt,
    updatedAt: createdAt,
    translations: input.translations,
    ingredients: input.ingredients.map((ingredient, position) => ({ ...ingredient, id: newId("ingredient"), position })),
    steps: input.steps.map((step) => ({ ...step, id: newId("step") })),
    tips: input.tips.map((tip, position) => ({ ...tip, id: newId("tip"), position })),
    missingIngredients: input.missingIngredients.map((ingredient) => ({ ...ingredient, id: newId("missing") }))
  };
}

function preferencesFrom(value: unknown): RecipePreferenceInput {
  const input = asObject(value);
  return {
    cuisine: asText(input.cuisine, "No Preference"),
    cookingTime: asText(input.cookingTime, "No Preference"),
    difficulty: input.difficulty === "easy" || input.difficulty === "medium" || input.difficulty === "hard" ? input.difficulty : "no_preference",
    dietaryPreference: asText(input.dietaryPreference, "No Preference"),
    equipment: asText(input.equipment, "No Preference"),
    recognizedOnly: asBoolean(input.recognizedOnly),
    allowSeasonings: asBoolean(input.allowSeasonings, true),
    allowOptionalExtras: asBoolean(input.allowOptionalExtras, true)
  };
}

function recognizedIngredients(value: unknown): RecognizedIngredientInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const input = asObject(item);
    const confidence: RecognizedIngredientInput["confidence"] = input.confidence === "high" || input.confidence === "low" ? input.confidence : "medium";
    return {
      normalizedName: asText(input.normalizedName),
      displayNameEn: asText(input.displayNameEn),
      displayNameZh: asText(input.displayNameZh),
      estimatedAmount: asText(input.estimatedAmount, "as available"),
      estimatedCalories: asNumber(input.estimatedCalories) ?? undefined,
      confidence,
      notes: asText(input.notes)
    };
  }).filter((ingredient) => ingredient.normalizedName || ingredient.displayNameEn || ingredient.displayNameZh);
}

async function localRecipeImage(input: Record<string, unknown>): Promise<RecipeReferenceImageView | null> {
  const queryText = asText(input.title) || asText(input.referenceImageQuery) || asText(input.cuisineStyle);
  if (!queryText) return null;
  try {
    const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(queryText)}`);
    if (!response.ok) return null;
    const result = asObject(await response.json());
    const meals = Array.isArray(result.meals) ? result.meals.map(asObject) : [];
    const meal = meals.find((item) => asText(item.strMealThumb)) ?? null;
    if (!meal) return null;
    return {
      url: asText(meal.strMealThumb),
      sourceTitle: asText(meal.strMeal, queryText),
      sourceUrl: "https://www.themealdb.com/",
      provider: "themealdb"
    };
  } catch {
    return null;
  }
}

async function mobileGeminiKey(profileId: string) {
  const { settings } = await ensureProfile(profileId);
  if (settings.aiProvider !== "gemini") {
    throw new MobileApiError("Mobile AI currently supports Google Gemini. Select Gemini and save its API key in Profile.", 503, { code: "MOBILE_GEMINI_REQUIRED" });
  }
  if (!settings.geminiApiKey) {
    throw new MobileApiError("Add your Gemini API key in Profile before using AI features.", 503, { code: "MOBILE_AI_KEY_REQUIRED" });
  }
  return settings.geminiApiKey;
}

async function handleMobileRoute(path: string, options: MobileApiOptions) {
  await ensureDatabase();
  const url = apiPath(path);
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const body = asObject(options.body);
  const profileId = options.profileId ?? (asText(body.profileId) || null);
  const pathname = url.pathname;

  if (pathname === "/api/health") return { ok: true, storage: "native-sqlite" };

  if (pathname === "/api/profile") {
    if (method === "POST") {
      const id = asText(body.profileId) || profileId;
      if (!id) throw new MobileApiError("Missing profile ID.", 400);
      const result = await ensureProfile(id);
      return { profile: result.profile, settings: publicSettings(result.settings) };
    }
    if (!profileId) return { profile: null, settings: null };
    if (method === "PATCH") return { profile: await updateProfile(profileId, body) };
    const result = await ensureProfile(profileId);
    return { profile: result.profile, settings: publicSettings(result.settings) };
  }

  if (!profileId && pathname !== "/api/runtime-status") {
    throw new MobileApiError("Missing profile ID.", 400);
  }

  if (pathname === "/api/settings") {
    const result = await ensureProfile(profileId!);
    if (method === "PATCH") return { settings: publicSettings(await updateSettings(profileId!, body)) };
    return { settings: publicSettings(result.settings) };
  }

  if (pathname === "/api/ai-settings") {
    const result = await ensureProfile(profileId!);
    if (method === "PATCH") {
      const provider = body.provider === "openai" ? "openai" : "gemini";
      const clear = asBoolean(body.clearApiKey);
      const key = asText(body.apiKey).trim();
      const updated: LocalSettings = {
        ...result.settings,
        aiProvider: provider,
        geminiApiKey: provider === "gemini" ? (clear ? null : key || result.settings.geminiApiKey) : result.settings.geminiApiKey,
        openaiApiKey: provider === "openai" ? (clear ? null : key || result.settings.openaiApiKey) : result.settings.openaiApiKey
      };
      await saveRecord("settings", profileId!, profileId!, updated);
      return { aiSettings: aiSettings(updated) };
    }
    return { aiSettings: aiSettings(result.settings) };
  }

  if (pathname === "/api/water") {
    const date = asText(body.date) || url.searchParams.get("date") || "";
    if (!date) throw new MobileApiError("Missing date.", 400);
    if (method === "POST") {
      const createdAt = now();
      const entry = { id: newId("water"), amountMl: Math.max(0, asNumber(body.amountMl, 0) ?? 0), createdAt };
      await saveRecord("water-entry", profileId!, entry.id, entry, date, createdAt);
    } else if (method === "PATCH") {
      const target = Math.max(250, asNumber(body.targetMl, 2000) ?? 2000);
      await saveRecord("water-target", profileId!, `${profileId}:${date}`, { targetMl: target }, date);
    } else if (method === "DELETE") {
      const entries = await listRecords<WaterSummary["entries"][number]>("water-entry", profileId!, date);
      await Promise.all(entries.map((entry) => deleteRecord("water-entry", profileId!, entry.id)));
    }
    return { water: await waterSummary(profileId!, date) };
  }

  if (pathname === "/api/food-logs") {
    const date = asText(body.date) || url.searchParams.get("date") || "";
    if (method === "GET") {
      if (!date) throw new MobileApiError("Missing date.", 400);
      const [logs, profile] = await Promise.all([foodLogs(profileId!, date), ensureProfile(profileId!)]);
      const total = logs.reduce((sum, log) => sum + (log.calories ?? 0), 0);
      return { logs, total, calorieGuidance: buildCalorieGuidance(profile.profile, total), nutritionSummary: buildNutritionSummary(logs, total) };
    }
    if (method === "DELETE") return { deleted: await deleteRecord("food-log", profileId!, asText(body.id)) };
    const existing = method === "PATCH" ? await getRecord<FoodLogView>("food-log", profileId!, asText(body.id)) : null;
    const createdAt = existing?.data.createdAt ?? now();
    let log: FoodLogView;
    if (body.sourceType === "recipe") {
      const recipe = await getRecord<RecipeView>("recipe", profileId!, asText(body.recipeId));
      if (!recipe) throw new MobileApiError("Recipe not found.", 404);
      const titleEn = recipe.data.translations.find((item) => item.locale === "en")?.title ?? recipe.data.cuisineStyle;
      const titleZh = recipe.data.translations.find((item) => item.locale === "zh-CN")?.title ?? null;
      log = {
        id: existing?.id ?? newId("food"), recipeId: recipe.data.id, date: asText(body.date), mealCategory: asMealCategory(body.mealCategory),
        nameEn: titleEn, nameZh: titleZh, calories: asNumber(body.calories, recipe.data.estimatedCaloriesPerServing),
        proteinGrams: recipe.data.estimatedProteinGramsPerServing, carbsGrams: recipe.data.estimatedCarbsGramsPerServing,
        fatGrams: recipe.data.estimatedFatGramsPerServing, notes: null, sourceType: "recipe", createdAt, updatedAt: now()
      };
    } else {
      log = {
        id: existing?.id ?? newId("food"), recipeId: asText(body.recipeId) || null, date: asText(body.date), mealCategory: asMealCategory(body.mealCategory),
        nameEn: asText(body.nameEn), nameZh: asText(body.nameZh) || null, calories: asNumber(body.calories),
        proteinGrams: asNumber(body.proteinGrams), carbsGrams: asNumber(body.carbsGrams), fatGrams: asNumber(body.fatGrams),
        notes: asText(body.notes) || null, sourceType: body.sourceType === "ingredient_scan" ? "ingredient_scan" : "manual", createdAt, updatedAt: now()
      };
    }
    await saveRecord("food-log", profileId!, log.id, log, log.date, log.createdAt);
    return { log };
  }

  if (pathname === "/api/exercise") {
    const date = asText(body.date) || url.searchParams.get("date") || "";
    if (method === "GET") {
      const logs = await exerciseLogs(profileId!, date);
      return { logs, totalMinutes: logs.reduce((sum, log) => sum + log.durationMinutes, 0) };
    }
    if (method === "DELETE") return { deleted: await deleteRecord("exercise", profileId!, asText(body.id)) };
    const existing = method === "PATCH" ? await getRecord<ExerciseLogView>("exercise", profileId!, asText(body.id)) : null;
    const createdAt = existing?.data.createdAt ?? now();
    const log: ExerciseLogView = {
      id: existing?.id ?? newId("exercise"), type: asText(body.type), durationMinutes: Math.max(0, asNumber(body.durationMinutes, 0) ?? 0),
      estimatedCaloriesBurned: asNumber(body.estimatedCaloriesBurned), date, notes: asText(body.notes) || null, createdAt, updatedAt: now()
    };
    await saveRecord("exercise", profileId!, log.id, log, date, createdAt);
    return { log };
  }

  if (pathname === "/api/sleep") {
    const date = asText(body.date) || url.searchParams.get("date") || undefined;
    if (method === "GET") return { sleep: await sleepLog(profileId!, date, url.searchParams.get("latest") === "1") };
    if (!date) throw new MobileApiError("Missing date.", 400);
    const id = `${profileId}:${date}`;
    if (method === "DELETE") return { deleted: await deleteRecord("sleep", profileId!, id) };
    const existing = await getRecord<SleepLogView>("sleep", profileId!, id);
    const createdAt = existing?.data.createdAt ?? now();
    const sleep: SleepLogView = {
      id, date, hours: Math.max(0, asNumber(body.hours, 0) ?? 0), quality: body.quality === "poor" || body.quality === "good" ? body.quality : "average",
      notes: asText(body.notes) || null, createdAt, updatedAt: now()
    };
    await saveRecord("sleep", profileId!, id, sleep, date, createdAt);
    return { sleep };
  }

  if (pathname === "/api/weight") {
    const date = asText(body.date) || url.searchParams.get("date") || undefined;
    if (method === "GET") {
      if (url.searchParams.get("recent") === "1") {
        const weights = (await listRecords<WeightLogView>("weight", profileId!)).map((record) => record.data).sort((left, right) => left.date.localeCompare(right.date));
        return { weights };
      }
      return { weight: await weightLog(profileId!, date, url.searchParams.get("latest") === "1") };
    }
    if (!date) throw new MobileApiError("Missing date.", 400);
    const id = `${profileId}:${date}`;
    if (method === "DELETE") return { deleted: await deleteRecord("weight", profileId!, id) };
    const existing = await getRecord<WeightLogView>("weight", profileId!, id);
    const createdAt = existing?.data.createdAt ?? now();
    const weight: WeightLogView = { id, date, weightKg: Math.max(0, asNumber(body.weightKg, 0) ?? 0), notes: asText(body.notes) || null, createdAt, updatedAt: now() };
    await saveRecord("weight", profileId!, id, weight, date, createdAt);
    return { weight };
  }

  if (pathname === "/api/ingredient-scans") {
    if (method === "GET") {
      const scans = (await listRecords<IngredientScanView>("scan", profileId!)).map((record) => record.data).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return url.searchParams.get("latest") === "1" ? { scan: scans[0] ?? null } : { scans };
    }
  }

  const scanMatch = pathname.match(/^\/api\/ingredient-scans\/([^/]+)$/);
  if (scanMatch) {
    const scanId = decodeURIComponent(scanMatch[1]);
    const stored = await getRecord<IngredientScanView>("scan", profileId!, scanId);
    if (!stored) throw new MobileApiError("Scan not found.", 404);
    if (method === "GET") return { scan: stored.data };
    if (method === "DELETE") return { deleted: await deleteRecord("scan", profileId!, scanId) };
    const ingredients = recognizedIngredients(body.ingredients).map((ingredient, position) => ({ ...ingredient, id: stored.data.ingredients[position]?.id ?? newId("ingredient"), position }));
    const scan: IngredientScanView = { ...stored.data, ingredients, confirmedAt: asBoolean(body.confirmed) ? now() : null };
    await saveRecord("scan", profileId!, scanId, scan, scan.createdAt.slice(0, 10), scan.createdAt);
    return { scan };
  }

  if (pathname === "/api/analyze-ingredients") {
    const apiKey = await mobileGeminiKey(profileId!);
    try {
      const result = await recognizeIngredientsWithGeminiImpl({
        apiKey,
        imageDataUrl: asText(body.imageDataUrl),
        locale: options.locale ?? "en"
      });
      if (!result.ok) {
        throw new MobileApiError("Gemini is not configured for ingredient recognition.", 503, { code: "MOBILE_AI_KEY_REQUIRED" });
      }
      const createdAt = now();
      const scan: IngredientScanView = {
        id: newId("scan"),
        imageName: asText(body.imageName, "food-image"),
        imageMimeType: asText(body.imageMimeType, "image/jpeg"),
        overallConfidence: result.result.overallConfidence,
        uncertaintyNoteEn: result.result.uncertaintyNoteEn,
        uncertaintyNoteZh: result.result.uncertaintyNoteZh,
        confirmedAt: null,
        createdAt,
        ingredients: result.result.ingredients.map((ingredient, position) => ({ ...ingredient, id: newId("ingredient"), position }))
      };
      await saveRecord("scan", profileId!, scan.id, scan, createdAt.slice(0, 10), createdAt);
      return { scan };
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError("Gemini could not analyze this image. Check your API key and internet connection, then try again.", 503, { code: "MOBILE_AI_REQUEST_FAILED" });
    }
  }

  if (pathname === "/api/generate-recipes") {
    let ingredients = recognizedIngredients(body.manualIngredients);
    let sourceScanId: string | null = null;
    if (asText(body.scanId)) {
      const scan = await getRecord<IngredientScanView>("scan", profileId!, asText(body.scanId));
      if (!scan) throw new MobileApiError("Scan not found.", 404);
      ingredients = scan.data.ingredients;
      sourceScanId = scan.id;
    } else if (asText(body.sourceRecipeId)) {
      const recipe = await getRecord<RecipeView>("recipe", profileId!, asText(body.sourceRecipeId));
      if (!recipe) throw new MobileApiError("Recipe not found.", 404);
      ingredients = recipe.data.ingredients.map((ingredient) => ({
        normalizedName: ingredient.normalizedName, displayNameEn: ingredient.nameEn, displayNameZh: ingredient.nameZh,
        estimatedAmount: ingredient.amount, confidence: "medium" as const, notes: ""
      }));
    }
    if (ingredients.length === 0) throw new MobileApiError("Please provide at least one ingredient.", 400);
    const locale = options.locale ?? "en";
    const preferences = preferencesFrom(body.preferences);
    const avoidRecipes = Array.isArray(body.avoidRecipes) ? body.avoidRecipes as AvoidRecipeInput[] : [];
    const epicure = await mobileEpicurePairings({ ingredients, preferences });
    let generated: ReturnType<typeof generateFallbackRecipes> | null = null;
    try {
      const apiKey = await mobileGeminiKey(profileId!);
      const result = await generateRecipesWithGeminiImpl({ apiKey, locale, ingredients, pairings: epicure.pairings, preferences, avoidRecipes });
      if (result.ok) generated = result.recipes;
    } catch {
      // A failed online request deliberately falls through to the existing confirmation dialog.
    }
    if (!generated && !asBoolean(body.allowLocalFallback)) {
      throw new MobileApiError("Gemini recipe generation is temporarily unavailable. Use local recipe generation instead?", 503, { code: "LOCAL_RECIPE_FALLBACK_AVAILABLE", localFallbackAvailable: true });
    }
    generated ??= generateFallbackRecipes({ locale, ingredients, pairings: epicure.pairings, preferences });
    const recipes = generated.map((recipe) => savedRecipe(profileId!, sourceScanId, recipe));
    await Promise.all(recipes.map((recipe) => saveRecord("recipe", profileId!, recipe.id, recipe, recipe.createdAt.slice(0, 10), recipe.createdAt)));
    return { recipes, epicureStatus: epicure.status };
  }

  if (pathname === "/api/recipes") {
    const recipes = (await listRecords<RecipeView>("recipe", profileId!)).map((record) => record.data).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { recipes: url.searchParams.get("favorites") === "1" ? recipes.filter((recipe) => recipe.isFavorite) : recipes };
  }

  const recipeAction = pathname.match(/^\/api\/recipes\/([^/]+)(?:\/(favorite|reference-image))?$/);
  if (recipeAction) {
    const recipeId = decodeURIComponent(recipeAction[1]);
    const stored = await getRecord<RecipeView>("recipe", profileId!, recipeId);
    if (!stored) throw new MobileApiError("Recipe not found.", 404);
    if (method === "GET") return { recipe: stored.data };
    if (method === "DELETE") return { deleted: await deleteRecord("recipe", profileId!, recipeId) };
    const action = recipeAction[2];
    const referenceImage = body.referenceImage === null ? null : asObject(body.referenceImage) as RecipeReferenceImageView;
    const recipe: RecipeView = {
      ...stored.data,
      isFavorite: action === "favorite" ? asBoolean(body.isFavorite) : stored.data.isFavorite,
      referenceImage: action === "reference-image" || (action === "favorite" && body.referenceImage !== undefined) ? referenceImage : stored.data.referenceImage,
      updatedAt: now()
    };
    await saveRecord("recipe", profileId!, recipeId, recipe, recipe.createdAt.slice(0, 10), recipe.createdAt);
    return { recipe };
  }

  if (pathname === "/api/recipe-image") return { image: await localRecipeImage(body) };

  const historyMatch = pathname.match(/^\/api\/history\/(\d{4}-\d{2}-\d{2})(?:\/delete)?$/);
  if (historyMatch) {
    const date = historyMatch[1];
    if (pathname.endsWith("/delete")) {
      const recordTypes = ["food-log", "water-entry", "water-target", "exercise", "sleep", "weight"];
      await Promise.all(recordTypes.flatMap(async (type) => (await listRecords<unknown>(type, profileId!, date)).map((record) => deleteRecord(type, profileId!, record.id))));
      return { deleted: true };
    }
    return { history: await dailyHistory(profileId!, date) };
  }

  if (pathname === "/api/backup") {
    if (method === "GET") {
      const [{ profile, settings }, records] = await Promise.all([ensureProfile(profileId!), backupRecords(profileId!)]);
      return {
        format: "daily-health-mobile-backup",
        version: 1,
        exportedAt: now(),
        profile,
        settings,
        records
      };
    }
    const backup = asObject(body.backup);
    if (backup.format !== "daily-health-mobile-backup" || !Array.isArray(backup.records)) {
      throw new MobileApiError("This file is not a Daily Health mobile backup.", 400);
    }
    await run("DELETE FROM health_records WHERE profile_id = ?", [profileId!]);
    for (const item of backup.records) {
      const record = asObject(item);
      const type = asText(record.type);
      const id = asText(record.id);
      if (!type || !id) continue;
      await saveRecord(type, profileId!, id, record.data, recordDate(asText(record.date)), asText(record.createdAt) || now());
    }
    const records = await backupRecords(profileId!);
    const count = (type: string) => records.filter((record) => record.type === type).length;
    return {
      summary: {
        foodLogs: count("food-log"),
        recipes: count("recipe"),
        scans: count("scan"),
        waterEntries: count("water-entry"),
        exerciseLogs: count("exercise"),
        sleepLogs: count("sleep"),
        weightLogs: count("weight")
      }
    };
  }

  if (pathname === "/api/estimate-nutrition") {
    const apiKey = await mobileGeminiKey(profileId!);
    try {
      const result = await estimateFoodNutritionWithGeminiImpl({
        apiKey,
        locale: options.locale ?? "en",
        nameEn: asText(body.nameEn),
        nameZh: asText(body.nameZh) || undefined,
        calories: asNumber(body.calories),
        notes: asText(body.notes) || undefined
      });
      if (!result.ok) {
        throw new MobileApiError("Gemini is not configured for nutrition estimation.", 503, { code: "MOBILE_AI_KEY_REQUIRED" });
      }
      return { estimate: result.estimate };
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError("Gemini could not estimate nutrition. Check your API key and internet connection, then try again.", 503, { code: "MOBILE_AI_REQUEST_FAILED" });
    }
  }

  if (pathname === "/api/error-logs") {
    if (method === "GET") {
      const logs = (await listRecords<AppErrorLogView>("error-log", profileId!)).map((record) => record.data).slice(-Number(url.searchParams.get("limit") ?? "12"));
      return { logs };
    }
    const createdAt = now();
    const log: AppErrorLogView = {
      id: newId("error"), profileId, source: asText(body.source), severity: body.severity === "info" || body.severity === "warning" ? body.severity : "error",
      message: asText(body.message), path: asText(body.path) || null, method: asText(body.method) || null, statusCode: asNumber(body.statusCode),
      stack: asText(body.stack) || null, userAgent: asText(body.userAgent) || null, details: asObject(body.details), createdAt
    };
    await saveRecord("error-log", profileId!, log.id, log, createdAt.slice(0, 10), createdAt);
    return { log };
  }

  if (pathname === "/api/runtime-status") {
    return {
      checkedAt: now(), state: "ok", serverOrigin: "capacitor://localhost", serverHost: "device", protocol: "https",
      connectionMode: "loopback", isHttps: true, isLoopback: true, isPrivateNetwork: false, apkReachable: true, lanOrigins: [],
      imageGeneration: { provider: "disabled", location: "disabled", configured: true, requiresServerGpu: false, requiresInternet: false, localApi: null, endpoint: null, model: null },
      notesEn: ["Health records are stored in native SQLite on this device."], notesZh: ["健康记录保存在此设备的原生 SQLite 数据库中。"]
    };
  }

  if (pathname === "/api/service-status") {
    return {
      checkedAt: now(), overall: "ok", items: [
        { id: "app", state: "ok", titleEn: "Mobile app", titleZh: "手机应用", summaryEn: "Running locally on this device.", summaryZh: "正在此设备本地运行。", detailsEn: [], detailsZh: [] },
        { id: "database", state: "ok", titleEn: "Local database", titleZh: "本地数据库", summaryEn: "Native SQLite is available.", summaryZh: "原生 SQLite 可用。", detailsEn: [], detailsZh: [] },
        { id: "ai", state: "warning", titleEn: "AI service", titleZh: "AI 服务", summaryEn: "Requires your API key and internet connection.", summaryZh: "需要你的 API Key 和网络连接。", detailsEn: [], detailsZh: [] },
        { id: "nutrition", state: "warning", titleEn: "Nutrition", titleZh: "营养计算", summaryEn: "AI estimate is not yet enabled in the mobile provider.", summaryZh: "手机端 AI 营养估算尚未启用。", detailsEn: [], detailsZh: [] },
        { id: "recipeImages", state: "warning", titleEn: "Recipe images", titleZh: "菜谱图片", summaryEn: "Uses online image sources when available.", summaryZh: "可用时使用在线图片来源。", detailsEn: [], detailsZh: [] },
        { id: "epicure", state: "warning", titleEn: "Epicure", titleZh: "Epicure", summaryEn: "Uses the device network through the embedded local server.", summaryZh: "通过内置本地服务器使用设备网络。", detailsEn: [], detailsZh: [] },
        { id: "mealdb", state: "ok", titleEn: "TheMealDB", titleZh: "TheMealDB", summaryEn: "Used as an optional image source.", summaryZh: "作为可选图片来源使用。", detailsEn: [], detailsZh: [] },
        { id: "localImage", state: "ok", titleEn: "Device storage", titleZh: "设备存储", summaryEn: "No PC GPU service is required.", summaryZh: "不需要电脑 GPU 服务。", detailsEn: [], detailsZh: [] }
      ]
    };
  }

  throw new MobileApiError(`The mobile database does not implement ${pathname} yet.`, 501);
}

export async function mobileApiFetch<T>(path: string, options: MobileApiOptions): Promise<T> {
  return handleMobileRoute(path, options) as Promise<T>;
}
