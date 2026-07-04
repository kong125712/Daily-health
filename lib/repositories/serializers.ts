import type {
  EpicurePairing,
  ExerciseLog,
  FoodLog,
  Prisma,
  Profile,
  Recipe,
  SleepLog,
  WaterEntry,
  WeightLog
} from "@prisma/client";
import type {
  Difficulty,
  EpicurePairingView,
  ExerciseLogView,
  FoodLogSource,
  FoodLogView,
  IngredientConfidence,
  IngredientScanView,
  MealCategory,
  ActivityLevel,
  CalorieGoal,
  ProfileGender,
  RecipeReferenceImageView,
  RecipeView,
  SleepLogView,
  SleepQuality,
  WaterSummary,
  WeightLogView
} from "@/lib/types/domain";
import { toIso } from "@/lib/utils/date";

const scanInclude = {
  ingredients: { orderBy: { position: "asc" as const } }
};

const recipeInclude = {
  translations: true,
  ingredients: { orderBy: { position: "asc" as const } },
  steps: { orderBy: { stepNumber: "asc" as const } },
  tips: { orderBy: { position: "asc" as const } },
  missingIngredients: true
};

export type ScanRecord = Prisma.IngredientScanGetPayload<{ include: typeof scanInclude }>;
export type RecipeRecord = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>;

export const scanWithIngredients = scanInclude;
export const recipeWithChildren = recipeInclude;

export function asConfidence(value: string): IngredientConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

export function asMealCategory(value: string): MealCategory {
  if (value === "breakfast" || value === "lunch" || value === "dinner" || value === "snack") {
    return value;
  }
  return "snack";
}

export function asFoodLogSource(value: string): FoodLogSource {
  if (value === "ingredient_scan" || value === "recipe") {
    return value;
  }
  return "manual";
}

export function asSleepQuality(value: string): SleepQuality {
  if (value === "poor" || value === "good") {
    return value;
  }
  return "average";
}

export function asDifficulty(value: string): Difficulty {
  if (value === "hard") {
    return "hard";
  }
  return value === "medium" ? "medium" : "easy";
}

export function asProfileGender(value: string | null): ProfileGender | null {
  if (value === "male" || value === "female" || value === "other") {
    return value;
  }
  return null;
}

export function asActivityLevel(value: string): ActivityLevel {
  if (value === "light" || value === "moderate" || value === "active" || value === "very_active") {
    return value;
  }
  return "sedentary";
}

export function asCalorieGoal(value: string): CalorieGoal {
  if (value === "lose" || value === "gain") {
    return value;
  }
  return "maintain";
}

function asRecipeImageProvider(value: string | null): RecipeReferenceImageView["provider"] {
  if (value === "ai" || value === "gemini" || value === "local" || value === "replicate" || value === "themealdb" || value === "wikipedia" || value === "wikimedia") {
    return value;
  }
  return "local";
}

export function serializeProfile(profile: Profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    gender: asProfileGender(profile.gender),
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: asActivityLevel(profile.activityLevel),
    calorieGoal: asCalorieGoal(profile.calorieGoal),
    dailyCalorieTarget: profile.dailyCalorieTarget,
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt)
  };
}

export function serializeScan(scan: ScanRecord): IngredientScanView {
  return {
    id: scan.id,
    imageName: scan.imageName,
    imageMimeType: scan.imageMimeType,
    overallConfidence: asConfidence(scan.overallConfidence),
    uncertaintyNoteEn: scan.uncertaintyNoteEn,
    uncertaintyNoteZh: scan.uncertaintyNoteZh,
    confirmedAt: scan.confirmedAt ? toIso(scan.confirmedAt) : null,
    createdAt: toIso(scan.createdAt),
    ingredients: scan.ingredients.map((ingredient) => ({
      id: ingredient.id,
      normalizedName: ingredient.normalizedName,
      displayNameEn: ingredient.displayNameEn,
      displayNameZh: ingredient.displayNameZh,
      estimatedAmount: ingredient.estimatedAmount,
      estimatedCalories: ingredient.estimatedCalories,
      confidence: asConfidence(ingredient.confidence),
      notes: ingredient.notes,
      position: ingredient.position
    }))
  };
}

export function serializePairing(pairing: EpicurePairing): EpicurePairingView {
  return {
    id: pairing.id,
    sourceIngredient: pairing.sourceIngredient,
    suggestedIngredient: pairing.suggestedIngredient,
    score: pairing.score ?? undefined,
    category: pairing.category ?? undefined,
    reasonEn: pairing.reasonEn,
    reasonZh: pairing.reasonZh,
    createdAt: toIso(pairing.createdAt)
  };
}

export function serializeRecipe(recipe: RecipeRecord): RecipeView {
  const referenceImage = recipe.referenceImageUrl ? {
    url: recipe.referenceImageUrl,
    sourceTitle: recipe.referenceImageSourceTitle ?? recipe.referenceImageQuery ?? recipeFallbackTitle(recipe),
    sourceUrl: recipe.referenceImageSourceUrl ?? "",
    provider: asRecipeImageProvider(recipe.referenceImageProvider),
    crop: recipe.referenceImageCropXPercent == null || recipe.referenceImageCropYPercent == null || recipe.referenceImageCropZoom == null ? undefined : {
      xPercent: recipe.referenceImageCropXPercent,
      yPercent: recipe.referenceImageCropYPercent,
      zoom: recipe.referenceImageCropZoom
    },
    aiSelected: Boolean(recipe.referenceImageAiReason),
    aiReason: recipe.referenceImageAiReason ?? undefined
  } : null;

  return {
    id: recipe.id,
    profileId: recipe.profileId,
    sourceScanId: recipe.sourceScanId,
    cuisineStyle: recipe.cuisineStyle,
    difficulty: asDifficulty(recipe.difficulty),
    referenceImageQuery: recipe.referenceImageQuery,
    referenceImage,
    estimatedCookingMinutes: recipe.estimatedCookingMinutes,
    servings: recipe.servings,
    estimatedCaloriesPerServing: recipe.estimatedCaloriesPerServing,
    isFavorite: recipe.isFavorite,
    createdAt: toIso(recipe.createdAt),
    updatedAt: toIso(recipe.updatedAt),
    translations: recipe.translations.map((translation) => ({
      locale: translation.locale === "zh-CN" ? "zh-CN" : "en",
      title: translation.title,
      shortDescription: translation.shortDescription,
      nutritionDisclaimer: translation.nutritionDisclaimer
    })),
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      normalizedName: ingredient.normalizedName,
      nameEn: ingredient.nameEn,
      nameZh: ingredient.nameZh,
      amount: ingredient.amount,
      isRecognizedIngredient: ingredient.isRecognizedIngredient,
      isOptional: ingredient.isOptional,
      position: ingredient.position
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      estimatedMinutes: step.estimatedMinutes ?? undefined,
      instructionEn: step.instructionEn,
      instructionZh: step.instructionZh
    })),
    tips: recipe.tips.map((tip) => ({
      id: tip.id,
      position: tip.position,
      contentEn: tip.contentEn,
      contentZh: tip.contentZh
    })),
    missingIngredients: recipe.missingIngredients.map((ingredient) => ({
      id: ingredient.id,
      normalizedName: ingredient.normalizedName,
      nameEn: ingredient.nameEn,
      nameZh: ingredient.nameZh,
      isOptional: ingredient.isOptional
    }))
  };
}

export function serializeFoodLog(log: FoodLog): FoodLogView {
  return {
    id: log.id,
    recipeId: log.recipeId,
    date: log.date,
    mealCategory: asMealCategory(log.mealCategory),
    nameEn: log.nameEn,
    nameZh: log.nameZh,
    calories: log.calories,
    proteinGrams: log.proteinGrams,
    carbsGrams: log.carbsGrams,
    fatGrams: log.fatGrams,
    notes: log.notes,
    sourceType: asFoodLogSource(log.sourceType),
    createdAt: toIso(log.createdAt),
    updatedAt: toIso(log.updatedAt)
  };
}

export function serializeWaterSummary(date: string, entries: WaterEntry[], targetMl: number): WaterSummary {
  return {
    date,
    entries: entries.map((entry) => ({
      id: entry.id,
      amountMl: entry.amountMl,
      createdAt: toIso(entry.createdAt)
    })),
    totalMl: entries.reduce((sum, entry) => sum + entry.amountMl, 0),
    targetMl
  };
}

export function serializeExercise(log: ExerciseLog): ExerciseLogView {
  return {
    id: log.id,
    type: log.type,
    durationMinutes: log.durationMinutes,
    estimatedCaloriesBurned: log.estimatedCaloriesBurned,
    date: log.date,
    notes: log.notes,
    createdAt: toIso(log.createdAt),
    updatedAt: toIso(log.updatedAt)
  };
}

export function serializeSleep(log: SleepLog): SleepLogView {
  return {
    id: log.id,
    date: log.date,
    hours: log.hours,
    quality: asSleepQuality(log.quality),
    notes: log.notes,
    createdAt: toIso(log.createdAt),
    updatedAt: toIso(log.updatedAt)
  };
}

export function serializeWeight(log: WeightLog): WeightLogView {
  return {
    id: log.id,
    date: log.date,
    weightKg: log.weightKg,
    notes: log.notes,
    createdAt: toIso(log.createdAt),
    updatedAt: toIso(log.updatedAt)
  };
}

export function recipeFallbackTitle(recipe: Recipe): string {
  return `${recipe.cuisineStyle} recipe`;
}
