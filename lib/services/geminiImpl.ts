import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AppLocale,
  AvoidRecipeInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput,
  EpicurePairingInput,
  RecipePreferenceInput
} from "@/lib/types/domain";
import {
  foodNutritionEstimateSchema,
  generatedRecipesSchema,
  recognitionResultSchema
} from "@/lib/validation/schemas";
import { parseAiJson } from "@/lib/services/jsonParsing";

function getGeminiClient(apiKey: string | null) {
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function getGeminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
}

function geminiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

function geminiErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
}

function isTransientGeminiError(error: unknown) {
  const message = geminiErrorMessage(error);
  return (
    geminiErrorStatus(error) === 503 ||
    message.includes("service unavailable") ||
    message.includes("high demand")
  );
}

async function retryTransientGemini<T>(operation: () => Promise<T>) {
  const retryDelaysMs = [700, 1600];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retryDelaysMs.length || !isTransientGeminiError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
    }
  }
}

export async function recognizeIngredientsWithGeminiImpl(input: {
  apiKey: string | null;
  imageDataUrl: string;
  locale: AppLocale;
}) {
  const genAI = getGeminiClient(input.apiKey);
  if (!genAI) return { ok: false as const, reason: "missing_key" as const };

  const matches = input.imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image data URL");
  const mimeType = matches[1];
  const base64Data = matches[2];

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const prompt = [
    "Analyze the image for visible food, ingredients, beverages, and obvious seasonings only.",
    "Do not invent hidden ingredients. If no food is identifiable, return an empty ingredients array.",
    "Use normalized English singular ingredient names for normalizedName.",
    "Provide English and Simplified Chinese display names.",
    "Estimate visible amounts cautiously and avoid exact weight claims unless packaging or labels show them.",
    "Estimate approximate calories in kcal for the visible estimatedAmount. Use null for estimatedCalories if calories cannot be reasonably estimated.",
    "Avoid medical advice. Mention uncertainty honestly.",
    "Return valid JSON only with this shape:",
    `{ "overallConfidence": "high" | "medium" | "low", "uncertaintyNoteEn": "string", "uncertaintyNoteZh": "string", "ingredients": [{ "normalizedName": "...", "displayNameEn": "...", "displayNameZh": "...", "estimatedAmount": "...", "estimatedCalories": 120, "confidence": "high|medium|low", "notes": "..." }] }`,
    `Prefer ${input.locale === "zh-CN" ? "Simplified Chinese" : "English"} phrasing where notes are language-specific.`,
  ].join("\n");

  const result = await retryTransientGemini(() => model.generateContent([
    { text: prompt },
    {
      inlineData: { mimeType, data: base64Data },
    },
  ]));

  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Gemini returned empty recognition response");

  try {
    const parsed = recognitionResultSchema.parse(parseAiJson(text));
    return { ok: true as const, result: parsed };
  } catch {
    throw new Error("AI returned an unexpected format for ingredient recognition.");
  }
}

export async function generateRecipesWithGeminiImpl(input: {
  apiKey: string | null;
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
  avoidRecipes?: AvoidRecipeInput[];
}) {
  const genAI = getGeminiClient(input.apiKey);
  if (!genAI) return { ok: false as const, reason: "missing_key" as const };

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const ingredientText = input.ingredients
    .map(i => `${i.displayNameEn} (${i.normalizedName}) - ${i.estimatedAmount}`)
    .join("\n");
  const pairingText = input.pairings.length
    ? input.pairings
        .map(p => `${p.sourceIngredient} + ${p.suggestedIngredient}: ${p.reasonEn}`)
        .join("\n")
    : "No external flavor graph pairings available; use standard culinary pairing logic.";
  const avoidText = (input.avoidRecipes ?? []).length
    ? (input.avoidRecipes ?? [])
        .map((recipe) => `- ${recipe.title}${recipe.cuisineStyle ? ` (${recipe.cuisineStyle})` : ""}${recipe.referenceImageQuery ? `, image query: ${recipe.referenceImageQuery}` : ""}`)
        .join("\n")
    : "None.";

  const prompt = [
    "Generate exactly 3 practical home-cooking recipes with meaningfully different finished dishes.",
    "Prefer the provided recognized ingredients and use the flavor pairing suggestions when useful.",
    "If the user supplied recipes to avoid, treat them as rejected results and do not repeat those dishes or near-duplicates.",
    "The 3 recipes may share the same main ingredient, but they must not be near-duplicate finished products.",
    "Make each recipe differ from the others in at least two of these ways: cooking method, dish format, sauce or broth texture, cuisine flavor profile, serving style.",
    "Avoid minor variants such as three tomato egg stir-fry/omelet/rice dishes. Prefer clearly distinct forms such as stir-fry, soup, stew, curry, rice bowl, noodle dish, salad, baked or grilled dish, wrap, or sandwich.",
    "Make the recipe writing detailed enough to cook from directly: use specific ingredient amounts, heat levels, timing, visual doneness cues, sauce texture cues, and serving notes.",
    "Each recipe should normally include 6 to 9 ordered steps. Each step should contain one concrete action plus either a time, heat level, texture cue, or doneness cue.",
    "Include 2 to 4 practical tips, such as prep order, substitutions, storage, texture control, or how to avoid overcooking.",
    "Clearly mark optional missing ingredients.",
    "Avoid unsafe cooking instructions, medical claims, diet-treatment advice, and allergy assumptions.",
    "Return both English and Simplified Chinese content whenever possible.",
    "Use structured JSON only with a top-level recipes array of exactly 3 items.",
    "Do not calculate recipe calories or macros yourself. Set estimatedCaloriesPerServing, estimatedProteinGramsPerServing, estimatedCarbsGramsPerServing, and estimatedFatGramsPerServing to 0; the server will calculate nutrition after generation from the final ingredient amounts and seasonings.",
    "For each recipe include referenceImageQuery: 3 to 6 English words describing the finished dish for selecting a food reference photo. Use the most common English dish name when possible, such as tomato egg stir fry or chicken curry. Do not use broad labels such as egg breakfast, protein meal, or healthy bowl. Use concrete dish/ingredient words, no brands and no punctuation.",
    "",
    "Visible or user-confirmed ingredients:",
    ingredientText || "No ingredients provided.",
    "",
    "Flavor pairing suggestions:",
    pairingText,
    "",
    "Previously rejected recipe ideas to avoid:",
    avoidText,
    "",
    "Preferences:",
    JSON.stringify(input.preferences),
    "",
    "Return JSON only, matching this exact shape (all string fields must be plain strings, never objects or arrays):",
    JSON.stringify({
      recipes: [
        {
          cuisineStyle: "string",
          difficulty: "easy | medium | hard",
          referenceImageQuery: "tomato egg stir fry",
          estimatedCookingMinutes: 0,
          servings: 0,
          estimatedCaloriesPerServing: 0,
          estimatedProteinGramsPerServing: 0,
          estimatedCarbsGramsPerServing: 0,
          estimatedFatGramsPerServing: 0,
          translations: [
            { locale: "en", title: "string", shortDescription: "string", nutritionDisclaimer: "string" },
            { locale: "zh-CN", title: "string", shortDescription: "string", nutritionDisclaimer: "string" }
          ],
          ingredients: [
            {
              normalizedName: "string",
              nameEn: "string",
              nameZh: "string",
              amount: "string",
              isRecognizedIngredient: true,
              isOptional: false
            }
          ],
          steps: [
            {
              stepNumber: 1,
              estimatedMinutes: 0,
              instructionEn: "string",
              instructionZh: "string"
            }
          ],
          tips: [{ contentEn: "string", contentZh: "string" }],
          missingIngredients: [
            { normalizedName: "string", nameEn: "string", nameZh: "string", isOptional: true }
          ]
        }
      ]
    }),
    "The top-level recipes array must contain exactly 3 items.",
    `The user is currently viewing the app in ${input.locale}.`,
  ].join("\n");

  const result = await retryTransientGemini(() => model.generateContent(prompt));
  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Gemini returned empty recipe response");

  try {
    const parsed = generatedRecipesSchema.parse(parseAiJson(text));
    return {
      ok: true as const,
      recipes: parsed.recipes as GeneratedRecipeInput[],
    };
  } catch {
    throw new Error("AI returned an unexpected format for recipe generation.");
  }
}

export async function estimateFoodNutritionWithGeminiImpl(input: {
  apiKey: string | null;
  locale: AppLocale;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  notes?: string | null;
}) {
  const genAI = getGeminiClient(input.apiKey);
  if (!genAI) return { ok: false as const, reason: "missing_key" as const };

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const prompt = [
    "Estimate nutrition for one food log entry.",
    "Use common food composition knowledge and the serving implied by the food name, user notes, and calories if provided.",
    "If calories are provided, make protein/carbs/fat calories roughly consistent with that value unless the food description makes that impossible.",
    "If calories are not provided, estimate calories too.",
    "Do not give medical advice. Be honest that values are approximate.",
    "Return JSON only with this exact shape:",
    JSON.stringify({
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      confidence: "high | medium | low",
      notesEn: "string",
      notesZh: "string"
    }),
    "",
    "Food log:",
    JSON.stringify({
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      calories: input.calories ?? null,
      notes: input.notes ?? null
    }),
    `Prefer ${input.locale === "zh-CN" ? "Simplified Chinese" : "English"} phrasing where notes are language-specific.`
  ].join("\n");

  const result = await retryTransientGemini(() => model.generateContent(prompt));
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty nutrition response");

  try {
    const estimate = foodNutritionEstimateSchema.parse(parseAiJson(text));
    return { ok: true as const, estimate };
  } catch {
    throw new Error("AI returned an unexpected format for nutrition estimation.");
  }
}
