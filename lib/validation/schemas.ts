import { z } from "zod";

export const appLocaleSchema = z.enum(["en", "zh-CN"]);
export const themeModeSchema = z.enum(["light", "dark", "system"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const profileIdSchema = z.string().min(8).max(128);
export const mealCategorySchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const foodLogSourceSchema = z.enum(["manual", "ingredient_scan", "recipe"]);
export const sleepQualitySchema = z.enum(["poor", "average", "good"]);

export const profileRequestSchema = z.object({
  profileId: profileIdSchema
});

export const settingsUpdateSchema = z.object({
  profileId: profileIdSchema,
  locale: appLocaleSchema.optional(),
  theme: themeModeSchema.optional(),
  defaultWaterTargetMl: z.number().int().min(250).max(10000).optional()
});

export const recognizedIngredientSchema = z.object({
  normalizedName: z.string().trim().min(1).max(120),
  displayNameEn: z.string().trim().min(1).max(120),
  displayNameZh: z.string().trim().min(1).max(120),
  estimatedAmount: z.string().trim().min(1).max(120),
  estimatedCalories: z.number().int().min(0).max(5000).nullable().optional(),
  confidence: confidenceSchema,
  notes: z.string().trim().max(300).default("")
});

export const recognitionResultSchema = z.object({
  overallConfidence: confidenceSchema,
  uncertaintyNoteEn: z.string().trim().max(500).default(""),
  uncertaintyNoteZh: z.string().trim().max(500).default(""),
  ingredients: z.array(recognizedIngredientSchema).max(30)
});

export const analyzeIngredientsSchema = z.object({
  profileId: profileIdSchema,
  locale: appLocaleSchema.default("en"),
  imageName: z.string().trim().min(1).max(240),
  imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  imageDataUrl: z.string().startsWith("data:image/").max(12_000_000)
});

export const updateScanSchema = z.object({
  profileId: profileIdSchema,
  ingredients: z.array(recognizedIngredientSchema).max(30)
});

export const recipePreferenceSchema = z.object({
  cuisine: z.string().trim().min(1).max(60),
  cookingTime: z.string().trim().min(1).max(60),
  difficulty: z.enum(["easy", "medium", "no_preference"]),
  dietaryPreference: z.string().trim().min(1).max(80),
  equipment: z.string().trim().min(1).max(80),
  recognizedOnly: z.boolean(),
  allowSeasonings: z.boolean(),
  allowOptionalExtras: z.boolean()
});

export const generatedRecipeSchema = z.object({
  cuisineStyle: z.string().trim().min(1).max(80),
  difficulty: z.enum(["easy", "medium"]),
  estimatedCookingMinutes: z.number().int().min(1).max(240),
  servings: z.number().int().min(1).max(12),
  estimatedCaloriesPerServing: z.number().int().min(0).max(3000).optional(),
  translations: z.array(z.object({
    locale: appLocaleSchema,
    title: z.string().trim().min(1).max(140),
    shortDescription: z.string().trim().min(1).max(500),
    nutritionDisclaimer: z.string().trim().min(1).max(800)
  })).min(1).max(2),
  ingredients: z.array(z.object({
    normalizedName: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    nameZh: z.string().trim().min(1).max(120),
    amount: z.string().trim().min(1).max(120),
    isRecognizedIngredient: z.boolean(),
    isOptional: z.boolean()
  })).min(1).max(40),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1).max(30),
    estimatedMinutes: z.number().int().min(0).max(120).optional(),
    instructionEn: z.string().trim().min(1).max(1000),
    instructionZh: z.string().trim().min(1).max(1000)
  })).min(1).max(30),
  tips: z.array(z.object({
    contentEn: z.string().trim().min(1).max(500),
    contentZh: z.string().trim().min(1).max(500)
  })).max(10),
  missingIngredients: z.array(z.object({
    normalizedName: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    nameZh: z.string().trim().min(1).max(120),
    isOptional: z.boolean()
  })).max(12)
});

export const generatedRecipesSchema = z.object({
  recipes: z.array(generatedRecipeSchema).length(3)
});

export const generateRecipesRequestSchema = z.object({
  profileId: profileIdSchema,
  locale: appLocaleSchema.default("en"),
  scanId: z.string().cuid().optional(),
  sourceRecipeId: z.string().cuid().optional(),
  manualIngredients: z.array(recognizedIngredientSchema.pick({
    normalizedName: true,
    displayNameEn: true,
    displayNameZh: true,
    estimatedAmount: true,
    estimatedCalories: true
  }).extend({
    confidence: confidenceSchema.default("medium"),
    notes: z.string().trim().max(300).default("")
  })).max(30).default([]),
  preferences: recipePreferenceSchema
});

export const foodLogInputSchema = z.object({
  id: z.string().cuid().optional(),
  profileId: profileIdSchema,
  recipeId: z.string().cuid().nullable().optional(),
  date: dateSchema,
  mealCategory: mealCategorySchema,
  nameEn: z.string().trim().min(1).max(160),
  nameZh: z.string().trim().max(160).optional(),
  calories: z.number().int().min(0).max(5000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  sourceType: foodLogSourceSchema.default("manual")
});

export const waterEntrySchema = z.object({
  profileId: profileIdSchema,
  date: dateSchema,
  amountMl: z.number().int().min(1).max(5000)
});

export const waterTargetSchema = z.object({
  profileId: profileIdSchema,
  date: dateSchema,
  targetMl: z.number().int().min(250).max(10000)
});

export const exerciseLogInputSchema = z.object({
  id: z.string().cuid().optional(),
  profileId: profileIdSchema,
  type: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(0).max(1440),
  estimatedCaloriesBurned: z.number().int().min(0).max(5000).nullable().optional(),
  date: dateSchema,
  notes: z.string().trim().max(500).nullable().optional()
});

export const sleepLogInputSchema = z.object({
  profileId: profileIdSchema,
  date: dateSchema,
  hours: z.number().min(0).max(24),
  quality: sleepQualitySchema,
  notes: z.string().trim().max(500).nullable().optional()
});

export const weightLogInputSchema = z.object({
  profileId: profileIdSchema,
  date: dateSchema,
  weightKg: z.number().min(1).max(500),
  notes: z.string().trim().max(500).nullable().optional()
});

export const deleteByIdSchema = z.object({
  profileId: profileIdSchema,
  id: z.string().cuid()
});
