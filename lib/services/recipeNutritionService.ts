export type RecipeNutritionEstimate = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

type MacroShare = { protein: number; carbs: number; fat: number };
type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };

function text(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function macroShare(name: string): MacroShare {
  if (/chicken|beef|pork|fish|salmon|tuna|shrimp|prawn|egg|tofu|tempeh|turkey|lentil|bean/.test(name)) {
    return { protein: 0.58, carbs: 0.12, fat: 0.3 };
  }
  if (/rice|noodle|pasta|bread|potato|oat|corn|flour|grain/.test(name)) {
    return { protein: 0.12, carbs: 0.72, fat: 0.16 };
  }
  if (/oil|butter|coconut|avocado|nut|seed|cheese/.test(name)) {
    return { protein: 0.1, carbs: 0.12, fat: 0.78 };
  }
  if (/vegetable|broccoli|carrot|spinach|mushroom|tomato|onion|cabbage|fruit/.test(name)) {
    return { protein: 0.18, carbs: 0.62, fat: 0.2 };
  }
  return { protein: 0.25, carbs: 0.5, fat: 0.25 };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * Produces a useful non-empty nutrition estimate from the scan's AI calorie
 * estimates and ingredient names. It is a fallback when a provider omits macros.
 */
export function estimateRecipeNutrition(
  ingredients: readonly unknown[],
  variantIndex = 0,
  servings = 2
): RecipeNutritionEstimate {
  const totals = ingredients.reduce<MacroTotals>(
    (current, raw) => {
      const ingredient = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const name = [ingredient.normalizedName, ingredient.displayNameEn, ingredient.nameEn, ingredient.displayNameZh, ingredient.nameZh]
        .map(text)
        .join(" ");
      const calories = number(ingredient.estimatedCalories) ?? 100;
      const share = macroShare(name);
      return {
        calories: current.calories + calories,
        protein: current.protein + calories * share.protein,
        carbs: current.carbs + calories * share.carbs,
        fat: current.fat + calories * share.fat
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const recipeMultiplier = [1.1, 0.85, 1.2][variantIndex] ?? 1;
  const sourceCalories = totals.calories || 240;
  const totalCalories = Math.max(160, sourceCalories * recipeMultiplier);
  const divisor = Math.max(1, servings);
  const energy = totals.calories || 240;

  return {
    calories: Math.round(totalCalories / divisor),
    proteinGrams: round((totalCalories * (totals.protein / energy)) / 4 / divisor),
    carbsGrams: round((totalCalories * (totals.carbs / energy)) / 4 / divisor),
    fatGrams: round((totalCalories * (totals.fat / energy)) / 9 / divisor)
  };
}
