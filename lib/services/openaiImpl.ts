import OpenAI from "openai";
import type {
  AppLocale,
  EpicurePairingInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput,
  RecipePreferenceInput
} from "@/lib/types/domain";
import {
  generatedRecipesSchema,
  recognitionResultSchema
} from "@/lib/validation/schemas";

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence) as unknown;
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

  const parsed = recognitionResultSchema.parse(parseJsonContent(content));
  return { ok: true as const, result: parsed };
}

export async function generateRecipesWithOpenAIImpl(input: {
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
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

  const prompt = [
    "Generate exactly 3 practical home-cooking recipes with meaningfully different finished dishes.",
    "Prefer the provided recognized ingredients and use the flavor pairing suggestions when useful.",
    "The 3 recipes may share the same main ingredient, but they must not be near-duplicate finished products.",
    "Make each recipe differ from the others in at least two of these ways: cooking method, dish format, sauce or broth texture, cuisine flavor profile, serving style.",
    "Avoid minor variants such as three tomato egg stir-fry/omelet/rice dishes. Prefer clearly distinct forms such as stir-fry, soup, stew, curry, rice bowl, noodle dish, salad, baked or grilled dish, wrap, or sandwich.",
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
    "Preferences:",
    JSON.stringify(input.preferences),
    "",
    "Schema summary:",
    "recipes[].cuisineStyle, difficulty easy|medium, referenceImageQuery, estimatedCookingMinutes, servings, estimatedCaloriesPerServing, translations[en and zh-CN], ingredients, steps, tips, missingIngredients.",
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

  const parsed = generatedRecipesSchema.parse(parseJsonContent(content));
  const recipes: GeneratedRecipeInput[] = parsed.recipes;
  return { ok: true as const, recipes };
}
