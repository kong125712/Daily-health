import type {
  AppLocale,
  AvoidRecipeInput,
  EpicurePairingInput,
  RecognizedIngredientInput,
  RecipePreferenceInput
} from "@/lib/types/domain";

const provider = process.env.AI_PROVIDER || "openai";

export async function recognizeIngredientsWithOpenAI(input: {
  imageDataUrl: string;
  locale: AppLocale;
}) {
  if (provider === "gemini") {
    const { recognizeIngredientsWithGeminiImpl } = await import("./geminiImpl");
    return recognizeIngredientsWithGeminiImpl(input);
  }
  const { recognizeIngredientsWithOpenAIImpl } = await import("./openaiImpl");
  return recognizeIngredientsWithOpenAIImpl(input);
}

export async function generateRecipesWithOpenAI(input: {
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
  avoidRecipes?: AvoidRecipeInput[];
}) {
  if (provider === "gemini") {
    const { generateRecipesWithGeminiImpl } = await import("./geminiImpl");
    return generateRecipesWithGeminiImpl(input);
  }
  const { generateRecipesWithOpenAIImpl } = await import("./openaiImpl");
  return generateRecipesWithOpenAIImpl(input);
}

export async function estimateFoodNutrition(input: {
  locale: AppLocale;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  notes?: string | null;
}) {
  if (provider === "gemini") {
    const { estimateFoodNutritionWithGeminiImpl } = await import("./geminiImpl");
    return estimateFoodNutritionWithGeminiImpl(input);
  }
  const { estimateFoodNutritionWithOpenAIImpl } = await import("./openaiImpl");
  return estimateFoodNutritionWithOpenAIImpl(input);
}
