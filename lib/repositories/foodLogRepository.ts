import { prisma } from "@/lib/db";
import type { FoodLogView, MealCategory } from "@/lib/types/domain";
import { serializeFoodLog } from "./serializers";

export async function listFoodLogs(profileId: string, date: string) {
  const logs = await prisma.foodLog.findMany({
    where: { profileId, date },
    orderBy: { createdAt: "asc" }
  });
  return logs.map(serializeFoodLog);
}

export async function createFoodLog(input: {
  profileId: string;
  recipeId?: string | null;
  date: string;
  mealCategory: MealCategory;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  notes?: string | null;
  sourceType: "manual" | "ingredient_scan" | "recipe";
}) {
  const log = await prisma.foodLog.create({
    data: {
      profileId: input.profileId,
      recipeId: input.recipeId ?? null,
      date: input.date,
      mealCategory: input.mealCategory,
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      calories: input.calories,
      proteinGrams: input.proteinGrams,
      carbsGrams: input.carbsGrams,
      fatGrams: input.fatGrams,
      notes: input.notes,
      sourceType: input.sourceType
    }
  });
  return serializeFoodLog(log);
}

export async function updateFoodLog(input: {
  id: string;
  profileId: string;
  date: string;
  mealCategory: MealCategory;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  notes?: string | null;
}) {
  const existing = await prisma.foodLog.findFirst({
    where: { id: input.id, profileId: input.profileId }
  });
  if (!existing) {
    return null;
  }
  const log = await prisma.foodLog.update({
    where: { id: input.id },
    data: {
      date: input.date,
      mealCategory: input.mealCategory,
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      calories: input.calories,
      proteinGrams: input.proteinGrams,
      carbsGrams: input.carbsGrams,
      fatGrams: input.fatGrams,
      notes: input.notes
    }
  });
  return serializeFoodLog(log);
}

export async function deleteFoodLog(profileId: string, id: string) {
  const existing = await prisma.foodLog.findFirst({ where: { id, profileId } });
  if (!existing) {
    return false;
  }
  await prisma.foodLog.delete({ where: { id } });
  return true;
}

export function calculateFoodCalories(logs: FoodLogView[]) {
  return logs.reduce((sum, log) => sum + (log.calories ?? 0), 0);
}

export async function createRecipeFoodLog(input: {
  profileId: string;
  recipeId: string;
  date: string;
  mealCategory: MealCategory;
  calories?: number | null;
}) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: input.recipeId, profileId: input.profileId },
    include: { translations: true }
  });
  if (!recipe) {
    return null;
  }
  const en = recipe.translations.find((translation) => translation.locale === "en") ?? recipe.translations[0];
  const zh = recipe.translations.find((translation) => translation.locale === "zh-CN");
  return createFoodLog({
    profileId: input.profileId,
    recipeId: input.recipeId,
    date: input.date,
    mealCategory: input.mealCategory,
    nameEn: en?.title ?? recipe.cuisineStyle,
    nameZh: zh?.title,
    calories: input.calories ?? recipe.estimatedCaloriesPerServing,
    proteinGrams: recipe.estimatedProteinGramsPerServing,
    carbsGrams: recipe.estimatedCarbsGramsPerServing,
    fatGrams: recipe.estimatedFatGramsPerServing,
    sourceType: "recipe"
  });
}
