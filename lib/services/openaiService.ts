import type {
  AppLocale,
  AvoidRecipeInput,
  EpicurePairingInput,
  RecognizedIngredientInput,
  RecipePreferenceInput
} from "@/lib/types/domain";
import { resolveAiConfiguration } from "@/lib/services/aiConfiguration";

export async function recognizeIngredientsWithOpenAI(input: {
  profileId: string;
  imageDataUrl: string;
  locale: AppLocale;
}) {
  const configuration = await resolveAiConfiguration(input.profileId);
  if (configuration.provider === "gemini") {
    const { recognizeIngredientsWithGeminiImpl } = await import("./geminiImpl");
    const result = await recognizeIngredientsWithGeminiImpl({ ...input, apiKey: configuration.apiKey });
    return result.ok ? result : { ...result, provider: configuration.provider };
  }

  const { recognizeIngredientsWithOpenAIImpl } = await import("./openaiImpl");
  const result = await recognizeIngredientsWithOpenAIImpl({ ...input, apiKey: configuration.apiKey });
  return result.ok ? result : { ...result, provider: configuration.provider };
}

export async function generateRecipesWithOpenAI(input: {
  profileId: string;
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
  avoidRecipes?: AvoidRecipeInput[];
}) {
  const configuration = await resolveAiConfiguration(input.profileId);
  if (configuration.provider === "gemini") {
    const { generateRecipesWithGeminiImpl } = await import("./geminiImpl");
    const result = await generateRecipesWithGeminiImpl({ ...input, apiKey: configuration.apiKey });
    return result.ok ? result : { ...result, provider: configuration.provider };
  }

  const { generateRecipesWithOpenAIImpl } = await import("./openaiImpl");
  const result = await generateRecipesWithOpenAIImpl({ ...input, apiKey: configuration.apiKey });
  return result.ok ? result : { ...result, provider: configuration.provider };
}

export async function estimateFoodNutrition(input: {
  profileId: string;
  locale: AppLocale;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  notes?: string | null;
}) {
  const configuration = await resolveAiConfiguration(input.profileId);
  if (configuration.provider === "gemini") {
    const { estimateFoodNutritionWithGeminiImpl } = await import("./geminiImpl");
    const result = await estimateFoodNutritionWithGeminiImpl({ ...input, apiKey: configuration.apiKey });
    return result.ok ? result : { ...result, provider: configuration.provider };
  }

  const { estimateFoodNutritionWithOpenAIImpl } = await import("./openaiImpl");
  const result = await estimateFoodNutritionWithOpenAIImpl({ ...input, apiKey: configuration.apiKey });
  return result.ok ? result : { ...result, provider: configuration.provider };
}
