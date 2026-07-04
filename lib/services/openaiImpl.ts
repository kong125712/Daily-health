import OpenAI from "openai";
import type {
  AppLocale,
  AvoidRecipeInput,
  EpicurePairingInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput,
  RecipePreferenceInput
} from "@/lib/types/domain";
import {
  foodNutritionEstimateSchema,
  generatedRecipesSchema,
  recognitionResultSchema
} from "@/lib/validation/schemas";
import { parseAiJson } from "@/lib/services/jsonParsing";

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function recognizeIngredientsWithOpenAIImpl(input: {
  imageDataUrl: string;
  locale: AppLocale;
}) {
  const client = getOpenAIClient();
  if (!client) {
    return { ok: false as const, reason: "missing_key" as const };
  }

  const prompt = [
    "Analyze the image for visible food, ingredients, beverages, and obvious seasonings only.",
    "Do not invent hidden ingredients. If no food is identifiable, return an empty ingredients array.",
    "Use normalized English singular ingredient names for normalizedName.",
    "Provide English and Simplified Chinese display names.",
    "Estimate visible amounts cautiously and avoid exact weight claims unless packaging or labels show them.",
    "Estimate approximate calories in kcal for the visible estimatedAmount. Use null for estimatedCalories if calories cannot be reasonably estimated.",
    "Avoid medical advice. Mention uncertainty honestly.",
    "Return valid JSON only with this shape:",
    "{ overallConfidence: 'high' | 'medium' | 'low', uncertaintyNoteEn: string, uncertaintyNoteZh: string, ingredients: [{ normalizedName, displayNameEn, displayNameZh, estimatedAmount, estimatedCalories: number | null, confidence, notes }] }",
    `Prefer ${input.locale === "zh-CN" ? "Simplified Chinese" : "English"} phrasing where notes are language-specific.`
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a careful food image analyst. You return structured JSON only."
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: input.imageDataUrl,
              detail: "low"
            }
          }
        ]
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty recognition response.");
  }

  try {
    const parsed = recognitionResultSchema.parse(parseAiJson(content));
    return { ok: true as const, result: parsed };
  } catch {
    throw new Error("AI returned an unexpected format for ingredient recognition.");
  }
}

export async function generateRecipesWithOpenAIImpl(input: {
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
  avoidRecipes?: AvoidRecipeInput[];
}) {
  const client = getOpenAIClient();
  if (!client) {
    return { ok: false as const, reason: "missing_key" as const };
  }

  const ingredientText = input.ingredients
    .map((ingredient) => `${ingredient.displayNameEn} (${ingredient.normalizedName}) - ${ingredient.estimatedAmount}`)
    .join("\n");
  const pairingText = input.pairings.length
    ? input.pairings
        .map((pairing) => `${pairing.sourceIngredient} + ${pairing.suggestedIngredient}: ${pairing.reasonEn}`)
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
    "Do not calculate recipe calories yourself. Set estimatedCaloriesPerServing to 0; the server will calculate calories after generation from the final ingredient amounts and seasonings.",
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
    "Schema summary:",
    "recipes[].cuisineStyle, difficulty easy|medium|hard, referenceImageQuery, estimatedCookingMinutes, servings, estimatedCaloriesPerServing, translations[en and zh-CN], ingredients, steps, tips, missingIngredients.",
    `The user is currently viewing the app in ${input.locale}.`
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a bilingual recipe generation engine. You return valid JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty recipe response.");
  }

  try {
    const parsed = generatedRecipesSchema.parse(parseAiJson(content));
    const recipes: GeneratedRecipeInput[] = parsed.recipes;
    return { ok: true as const, recipes };
  } catch {
    throw new Error("AI returned an unexpected format for recipe generation.");
  }
}

export async function estimateFoodNutritionWithOpenAIImpl(input: {
  locale: AppLocale;
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  notes?: string | null;
}) {
  const client = getOpenAIClient();
  if (!client) {
    return { ok: false as const, reason: "missing_key" as const };
  }

  const prompt = [
    "Estimate nutrition for one food log entry.",
    "Use common food composition knowledge and the serving implied by the food name, user notes, and calories if provided.",
    "If calories are provided, make protein/carbs/fat calories roughly consistent with that value unless the food description makes that impossible.",
    "If calories are not provided, estimate calories too.",
    "Do not give medical advice. Be honest that values are approximate.",
    "Return JSON only with this shape:",
    "{ calories: number | null, proteinGrams: number | null, carbsGrams: number | null, fatGrams: number | null, confidence: 'high' | 'medium' | 'low', notesEn: string, notesZh: string }",
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

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a careful nutrition estimation engine. You return structured JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty nutrition response.");
  }

  try {
    const estimate = foodNutritionEstimateSchema.parse(parseAiJson(content));
    return { ok: true as const, estimate };
  } catch {
    throw new Error("AI returned an unexpected format for nutrition estimation.");
  }
}
