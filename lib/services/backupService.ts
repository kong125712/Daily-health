import { prisma } from "@/lib/db";
import { ensureProfile } from "@/lib/repositories/profileRepository";
import type { Prisma } from "@prisma/client";

const BACKUP_KIND = "daily-health-backup";
const BACKUP_VERSION = 1;

type RawRecord = Record<string, unknown>;

type BackupData = {
  profile: RawRecord | null;
  settings: RawRecord | null;
  ingredientScans: RawRecord[];
  recognizedIngredients: RawRecord[];
  epicurePairings: RawRecord[];
  recipes: RawRecord[];
  recipeTranslations: RawRecord[];
  recipeIngredients: RawRecord[];
  recipeSteps: RawRecord[];
  recipeTips: RawRecord[];
  recipeMissingIngredients: RawRecord[];
  foodLogs: RawRecord[];
  waterEntries: RawRecord[];
  waterTargets: RawRecord[];
  exerciseLogs: RawRecord[];
  sleepLogs: RawRecord[];
  weightLogs: RawRecord[];
};

export type DailyHealthBackup = {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: BackupData;
};

export type BackupImportSummary = {
  foodLogs: number;
  recipes: number;
  scans: number;
  waterEntries: number;
  exerciseLogs: number;
  sleepLogs: number;
  weightLogs: number;
};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): RawRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid backup file.");
  }
  return value;
}

function recordOrNull(value: unknown): RawRecord | null {
  return isRecord(value) ? value : null;
}

function arrayOfRecords(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(record: RawRecord, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function optionalString(record: RawRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(record: RawRecord, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerValue(record: RawRecord, key: string, fallback = 0) {
  return Math.round(numberValue(record, key, fallback));
}

function optionalNumber(record: RawRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalInteger(record: RawRecord, key: string) {
  const value = optionalNumber(record, key);
  return value == null ? null : Math.round(value);
}

function booleanValue(record: RawRecord, key: string, fallback = false) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function dateValue(record: RawRecord, key: string, fallback = new Date()) {
  const value = record[key];
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : fallback;
}

function optionalDate(record: RawRecord, key: string) {
  const value = record[key];
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function backupDataFromUnknown(value: unknown): BackupData {
  const backup = asRecord(value);
  if (backup.kind !== BACKUP_KIND || typeof backup.data !== "object" || backup.data === null) {
    throw new Error("Invalid backup file.");
  }

  const data = asRecord(backup.data);
  return {
    profile: recordOrNull(data.profile),
    settings: recordOrNull(data.settings),
    ingredientScans: arrayOfRecords(data.ingredientScans),
    recognizedIngredients: arrayOfRecords(data.recognizedIngredients),
    epicurePairings: arrayOfRecords(data.epicurePairings),
    recipes: arrayOfRecords(data.recipes),
    recipeTranslations: arrayOfRecords(data.recipeTranslations),
    recipeIngredients: arrayOfRecords(data.recipeIngredients),
    recipeSteps: arrayOfRecords(data.recipeSteps),
    recipeTips: arrayOfRecords(data.recipeTips),
    recipeMissingIngredients: arrayOfRecords(data.recipeMissingIngredients),
    foodLogs: arrayOfRecords(data.foodLogs),
    waterEntries: arrayOfRecords(data.waterEntries),
    waterTargets: arrayOfRecords(data.waterTargets),
    exerciseLogs: arrayOfRecords(data.exerciseLogs),
    sleepLogs: arrayOfRecords(data.sleepLogs),
    weightLogs: arrayOfRecords(data.weightLogs)
  };
}

export async function exportProfileBackup(profileId: string): Promise<DailyHealthBackup> {
  await ensureProfile(profileId);

  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  const settings = await prisma.appSettings.findUnique({ where: { profileId } });
  const ingredientScans = await prisma.ingredientScan.findMany({ where: { profileId }, orderBy: { createdAt: "asc" } });
  const scanIds = ingredientScans.map((scan) => scan.id);
  const recipes = await prisma.recipe.findMany({ where: { profileId }, orderBy: { createdAt: "asc" } });
  const recipeIds = recipes.map((recipe) => recipe.id);

  const [
    recognizedIngredients,
    epicurePairings,
    recipeTranslations,
    recipeIngredients,
    recipeSteps,
    recipeTips,
    recipeMissingIngredients,
    foodLogs,
    waterEntries,
    waterTargets,
    exerciseLogs,
    sleepLogs,
    weightLogs
  ] = await Promise.all([
    prisma.recognizedIngredient.findMany({ where: { scanId: { in: scanIds } }, orderBy: [{ scanId: "asc" }, { position: "asc" }] }),
    prisma.epicurePairing.findMany({ where: { scanId: { in: scanIds } }, orderBy: { createdAt: "asc" } }),
    prisma.recipeTranslation.findMany({ where: { recipeId: { in: recipeIds } }, orderBy: [{ recipeId: "asc" }, { locale: "asc" }] }),
    prisma.recipeIngredient.findMany({ where: { recipeId: { in: recipeIds } }, orderBy: [{ recipeId: "asc" }, { position: "asc" }] }),
    prisma.recipeStep.findMany({ where: { recipeId: { in: recipeIds } }, orderBy: [{ recipeId: "asc" }, { stepNumber: "asc" }] }),
    prisma.recipeTip.findMany({ where: { recipeId: { in: recipeIds } }, orderBy: [{ recipeId: "asc" }, { position: "asc" }] }),
    prisma.recipeMissingIngredient.findMany({ where: { recipeId: { in: recipeIds } }, orderBy: { recipeId: "asc" } }),
    prisma.foodLog.findMany({ where: { profileId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.waterEntry.findMany({ where: { profileId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.waterTarget.findMany({ where: { profileId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.exerciseLog.findMany({ where: { profileId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.sleepLog.findMany({ where: { profileId }, orderBy: { date: "asc" } }),
    prisma.weightLog.findMany({ where: { profileId }, orderBy: { date: "asc" } })
  ]);

  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile: profile as RawRecord | null,
      settings: settings as RawRecord | null,
      ingredientScans: ingredientScans as RawRecord[],
      recognizedIngredients: recognizedIngredients as RawRecord[],
      epicurePairings: epicurePairings as RawRecord[],
      recipes: recipes as RawRecord[],
      recipeTranslations: recipeTranslations as RawRecord[],
      recipeIngredients: recipeIngredients as RawRecord[],
      recipeSteps: recipeSteps as RawRecord[],
      recipeTips: recipeTips as RawRecord[],
      recipeMissingIngredients: recipeMissingIngredients as RawRecord[],
      foodLogs: foodLogs as RawRecord[],
      waterEntries: waterEntries as RawRecord[],
      waterTargets: waterTargets as RawRecord[],
      exerciseLogs: exerciseLogs as RawRecord[],
      sleepLogs: sleepLogs as RawRecord[],
      weightLogs: weightLogs as RawRecord[]
    }
  };
}

async function createProfile(tx: Prisma.TransactionClient, profileId: string, profile: RawRecord | null) {
  const source = profile ?? {};
  await tx.profile.create({
    data: {
      id: profileId,
      displayName: optionalString(source, "displayName"),
      gender: optionalString(source, "gender"),
      birthYear: optionalInteger(source, "birthYear"),
      heightCm: optionalNumber(source, "heightCm"),
      weightKg: optionalNumber(source, "weightKg"),
      activityLevel: stringValue(source, "activityLevel", "sedentary"),
      calorieGoal: stringValue(source, "calorieGoal", "maintain"),
      dailyCalorieTarget: optionalInteger(source, "dailyCalorieTarget"),
      createdAt: dateValue(source, "createdAt"),
      updatedAt: dateValue(source, "updatedAt")
    }
  });
}

async function createSettings(tx: Prisma.TransactionClient, profileId: string, settings: RawRecord | null) {
  const source = settings ?? {};
  const data: Prisma.AppSettingsUncheckedCreateInput = {
    profileId,
    locale: stringValue(source, "locale", "en"),
    theme: stringValue(source, "theme", "light"),
    defaultWaterTargetMl: integerValue(source, "defaultWaterTargetMl", 2000),
    createdAt: dateValue(source, "createdAt"),
    updatedAt: dateValue(source, "updatedAt")
  };
  const id = optionalString(source, "id");
  if (id) data.id = id;
  await tx.appSettings.create({ data });
}

async function createIngredientScans(tx: Prisma.TransactionClient, profileId: string, records: RawRecord[]) {
  const ids = new Set<string>();
  for (const record of records) {
    const id = stringValue(record, "id");
    if (!id) continue;
    ids.add(id);
    await tx.ingredientScan.create({
      data: {
        id,
        profileId,
        imageName: stringValue(record, "imageName", "imported-image"),
        imageMimeType: stringValue(record, "imageMimeType", "image/jpeg"),
        overallConfidence: stringValue(record, "overallConfidence", "medium"),
        uncertaintyNoteEn: stringValue(record, "uncertaintyNoteEn"),
        uncertaintyNoteZh: stringValue(record, "uncertaintyNoteZh"),
        confirmedAt: optionalDate(record, "confirmedAt"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }
  return ids;
}

async function createScanChildren(tx: Prisma.TransactionClient, data: BackupData, scanIds: Set<string>) {
  for (const record of data.recognizedIngredients) {
    const id = stringValue(record, "id");
    const scanId = stringValue(record, "scanId");
    if (!id || !scanIds.has(scanId)) continue;
    await tx.recognizedIngredient.create({
      data: {
        id,
        scanId,
        normalizedName: stringValue(record, "normalizedName"),
        displayNameEn: stringValue(record, "displayNameEn"),
        displayNameZh: stringValue(record, "displayNameZh"),
        estimatedAmount: stringValue(record, "estimatedAmount"),
        estimatedCalories: optionalInteger(record, "estimatedCalories"),
        confidence: stringValue(record, "confidence", "medium"),
        notes: stringValue(record, "notes"),
        position: integerValue(record, "position")
      }
    });
  }

  for (const record of data.epicurePairings) {
    const id = stringValue(record, "id");
    const scanId = stringValue(record, "scanId");
    if (!id || !scanIds.has(scanId)) continue;
    await tx.epicurePairing.create({
      data: {
        id,
        scanId,
        sourceIngredient: stringValue(record, "sourceIngredient"),
        suggestedIngredient: stringValue(record, "suggestedIngredient"),
        score: optionalNumber(record, "score"),
        category: optionalString(record, "category"),
        reasonEn: stringValue(record, "reasonEn"),
        reasonZh: stringValue(record, "reasonZh"),
        createdAt: dateValue(record, "createdAt")
      }
    });
  }
}

async function createRecipes(tx: Prisma.TransactionClient, profileId: string, records: RawRecord[], scanIds: Set<string>) {
  const ids = new Set<string>();
  for (const record of records) {
    const id = stringValue(record, "id");
    if (!id) continue;
    ids.add(id);
    const sourceScanId = optionalString(record, "sourceScanId");
    await tx.recipe.create({
      data: {
        id,
        profileId,
        sourceScanId: sourceScanId && scanIds.has(sourceScanId) ? sourceScanId : null,
        cuisineStyle: stringValue(record, "cuisineStyle", "home style"),
        difficulty: stringValue(record, "difficulty", "easy"),
        referenceImageQuery: optionalString(record, "referenceImageQuery"),
        referenceImageUrl: optionalString(record, "referenceImageUrl"),
        referenceImageSourceTitle: optionalString(record, "referenceImageSourceTitle"),
        referenceImageSourceUrl: optionalString(record, "referenceImageSourceUrl"),
        referenceImageProvider: optionalString(record, "referenceImageProvider"),
        referenceImageAiReason: optionalString(record, "referenceImageAiReason"),
        referenceImageCropXPercent: optionalNumber(record, "referenceImageCropXPercent"),
        referenceImageCropYPercent: optionalNumber(record, "referenceImageCropYPercent"),
        referenceImageCropZoom: optionalNumber(record, "referenceImageCropZoom"),
        estimatedCookingMinutes: integerValue(record, "estimatedCookingMinutes", 30),
        servings: integerValue(record, "servings", 1),
        estimatedCaloriesPerServing: optionalInteger(record, "estimatedCaloriesPerServing"),
        isFavorite: booleanValue(record, "isFavorite"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }
  return ids;
}

async function createRecipeChildren(tx: Prisma.TransactionClient, data: BackupData, recipeIds: Set<string>) {
  for (const record of data.recipeTranslations) {
    const id = stringValue(record, "id");
    const recipeId = stringValue(record, "recipeId");
    if (!id || !recipeIds.has(recipeId)) continue;
    await tx.recipeTranslation.create({
      data: {
        id,
        recipeId,
        locale: stringValue(record, "locale", "en"),
        title: stringValue(record, "title"),
        shortDescription: stringValue(record, "shortDescription"),
        nutritionDisclaimer: stringValue(record, "nutritionDisclaimer"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }

  for (const record of data.recipeIngredients) {
    const id = stringValue(record, "id");
    const recipeId = stringValue(record, "recipeId");
    if (!id || !recipeIds.has(recipeId)) continue;
    await tx.recipeIngredient.create({
      data: {
        id,
        recipeId,
        normalizedName: stringValue(record, "normalizedName"),
        nameEn: stringValue(record, "nameEn"),
        nameZh: stringValue(record, "nameZh"),
        amount: stringValue(record, "amount"),
        isRecognizedIngredient: booleanValue(record, "isRecognizedIngredient"),
        isOptional: booleanValue(record, "isOptional"),
        position: integerValue(record, "position")
      }
    });
  }

  for (const record of data.recipeSteps) {
    const id = stringValue(record, "id");
    const recipeId = stringValue(record, "recipeId");
    if (!id || !recipeIds.has(recipeId)) continue;
    await tx.recipeStep.create({
      data: {
        id,
        recipeId,
        stepNumber: integerValue(record, "stepNumber", 1),
        estimatedMinutes: optionalInteger(record, "estimatedMinutes"),
        instructionEn: stringValue(record, "instructionEn"),
        instructionZh: stringValue(record, "instructionZh")
      }
    });
  }

  for (const record of data.recipeTips) {
    const id = stringValue(record, "id");
    const recipeId = stringValue(record, "recipeId");
    if (!id || !recipeIds.has(recipeId)) continue;
    await tx.recipeTip.create({
      data: {
        id,
        recipeId,
        position: integerValue(record, "position"),
        contentEn: stringValue(record, "contentEn"),
        contentZh: stringValue(record, "contentZh")
      }
    });
  }

  for (const record of data.recipeMissingIngredients) {
    const id = stringValue(record, "id");
    const recipeId = stringValue(record, "recipeId");
    if (!id || !recipeIds.has(recipeId)) continue;
    await tx.recipeMissingIngredient.create({
      data: {
        id,
        recipeId,
        normalizedName: stringValue(record, "normalizedName"),
        nameEn: stringValue(record, "nameEn"),
        nameZh: stringValue(record, "nameZh"),
        isOptional: booleanValue(record, "isOptional", true)
      }
    });
  }
}

async function createDailyRecords(tx: Prisma.TransactionClient, profileId: string, data: BackupData, recipeIds: Set<string>) {
  for (const record of data.foodLogs) {
    const id = stringValue(record, "id");
    if (!id) continue;
    const recipeId = optionalString(record, "recipeId");
    await tx.foodLog.create({
      data: {
        id,
        profileId,
        recipeId: recipeId && recipeIds.has(recipeId) ? recipeId : null,
        date: stringValue(record, "date"),
        mealCategory: stringValue(record, "mealCategory", "snack"),
        nameEn: stringValue(record, "nameEn"),
        nameZh: optionalString(record, "nameZh"),
        calories: optionalInteger(record, "calories"),
        proteinGrams: optionalNumber(record, "proteinGrams"),
        carbsGrams: optionalNumber(record, "carbsGrams"),
        fatGrams: optionalNumber(record, "fatGrams"),
        notes: optionalString(record, "notes"),
        sourceType: stringValue(record, "sourceType", "manual"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }

  for (const record of data.waterEntries) {
    const id = stringValue(record, "id");
    if (!id) continue;
    await tx.waterEntry.create({
      data: {
        id,
        profileId,
        date: stringValue(record, "date"),
        amountMl: integerValue(record, "amountMl"),
        createdAt: dateValue(record, "createdAt")
      }
    });
  }

  for (const record of data.waterTargets) {
    const id = stringValue(record, "id");
    if (!id) continue;
    await tx.waterTarget.create({
      data: {
        id,
        profileId,
        date: stringValue(record, "date"),
        targetMl: integerValue(record, "targetMl", 2000),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }

  for (const record of data.exerciseLogs) {
    const id = stringValue(record, "id");
    if (!id) continue;
    await tx.exerciseLog.create({
      data: {
        id,
        profileId,
        type: stringValue(record, "type"),
        durationMinutes: integerValue(record, "durationMinutes"),
        estimatedCaloriesBurned: optionalInteger(record, "estimatedCaloriesBurned"),
        date: stringValue(record, "date"),
        notes: optionalString(record, "notes"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }

  for (const record of data.sleepLogs) {
    const id = stringValue(record, "id");
    if (!id) continue;
    await tx.sleepLog.create({
      data: {
        id,
        profileId,
        date: stringValue(record, "date"),
        hours: numberValue(record, "hours"),
        quality: stringValue(record, "quality", "average"),
        notes: optionalString(record, "notes"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }

  for (const record of data.weightLogs) {
    const id = stringValue(record, "id");
    if (!id) continue;
    await tx.weightLog.create({
      data: {
        id,
        profileId,
        date: stringValue(record, "date"),
        weightKg: numberValue(record, "weightKg"),
        notes: optionalString(record, "notes"),
        createdAt: dateValue(record, "createdAt"),
        updatedAt: dateValue(record, "updatedAt")
      }
    });
  }
}

export async function importProfileBackup(profileId: string, backup: unknown): Promise<BackupImportSummary> {
  const data = backupDataFromUnknown(backup);

  return prisma.$transaction(async (tx) => {
    await tx.profile.deleteMany({ where: { id: profileId } });
    await createProfile(tx, profileId, data.profile);
    await createSettings(tx, profileId, data.settings);
    const scanIds = await createIngredientScans(tx, profileId, data.ingredientScans);
    await createScanChildren(tx, data, scanIds);
    const recipeIds = await createRecipes(tx, profileId, data.recipes, scanIds);
    await createRecipeChildren(tx, data, recipeIds);
    await createDailyRecords(tx, profileId, data, recipeIds);

    return {
      foodLogs: data.foodLogs.length,
      recipes: recipeIds.size,
      scans: scanIds.size,
      waterEntries: data.waterEntries.length,
      exerciseLogs: data.exerciseLogs.length,
      sleepLogs: data.sleepLogs.length,
      weightLogs: data.weightLogs.length
    };
  });
}
