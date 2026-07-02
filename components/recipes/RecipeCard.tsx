"use client";

import { Clipboard, Eye, Heart, RefreshCw, Utensils } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { ingredientName, isoToday, recipeTranslation } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { MealCategory, RecipeView } from "@/lib/types/domain";
import { RecipeDetailModal } from "./RecipeDetailModal";
import { RecipeReferenceImage } from "./RecipeReferenceImage";

type RecipeCardProps = {
  recipe: RecipeView;
  onChanged: (recipe: RecipeView) => void;
  onSimilar: (recipe: RecipeView) => void;
  onToast: (message: string, type?: "success" | "error" | "info") => void;
};

export function RecipeCard({ recipe, onChanged, onSimilar, onToast }: RecipeCardProps) {
  const { locale, profileId, t } = useApp();
  const [open, setOpen] = useState(false);
  const [mealCategory, setMealCategory] = useState<MealCategory>("dinner");
  const [calories, setCalories] = useState(recipe.estimatedCaloriesPerServing?.toString() ?? "");
  const translation = recipeTranslation(recipe, locale);

  async function saveRecipe() {
    if (!profileId) return;
    try {
      const response = await apiFetch<{ recipe: RecipeView }>(`/api/recipes/${recipe.id}/favorite`, {
        method: "PATCH",
        profileId,
        locale,
        body: { profileId, isFavorite: true }
      });
      onChanged(response.recipe);
      onToast(t("recipes.favorited"), "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : t("common.error"), "error");
    }
  }

  async function copyIngredients() {
    const text = recipe.ingredients.map((item) => `${ingredientName(item, locale)} - ${item.amount}`).join("\n");
    await navigator.clipboard.writeText(text);
    onToast(t("common.copy"), "success");
  }

  async function logMeal() {
    if (!profileId) return;
    try {
      await apiFetch<{ log: unknown }>("/api/food-logs", {
        method: "POST",
        profileId,
        locale,
        body: {
          profileId,
          recipeId: recipe.id,
          date: isoToday(),
          mealCategory,
          calories: calories ? Number(calories) : null,
          sourceType: "recipe"
        }
      });
      onToast(t("common.success"), "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : t("common.error"), "error");
    }
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <RecipeReferenceImage recipe={recipe} compact />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{translation?.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{translation?.shortDescription}</p>
        </div>
        <span className="rounded-md bg-mint px-2 py-1 text-xs font-semibold text-leaf dark:bg-emerald-950 dark:text-emerald-200">
          {recipe.estimatedCookingMinutes} {t("common.minutes")}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
        <span>{recipe.cuisineStyle}</span>
        <span>{recipe.servings} servings</span>
        <span>{recipe.difficulty}</span>
        <span>{recipe.estimatedCaloriesPerServing ?? "-"} {t("common.calories")}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" type="button" onClick={() => void saveRecipe()} disabled={recipe.isFavorite}>
          <Heart className="h-4 w-4" aria-hidden="true" />
          {recipe.isFavorite ? t("common.saved") : t("recipes.saveRecipe")}
        </button>
        <button className="btn-secondary" type="button" onClick={() => void copyIngredients()}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          {t("recipes.copyIngredients")}
        </button>
        <button className="btn-secondary" type="button" onClick={() => setOpen(true)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          {t("recipes.viewFull")}
        </button>
        <button className="btn-secondary" type="button" onClick={() => onSimilar(recipe)}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("recipes.similar")}
        </button>
      </div>
      <div className="mt-4 grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-[1fr_1fr_auto]">
        <select className="field-input" value={mealCategory} onChange={(event) => setMealCategory(event.target.value as MealCategory)}>
          <option value="breakfast">{t("food.breakfast")}</option>
          <option value="lunch">{t("food.lunch")}</option>
          <option value="dinner">{t("food.dinner")}</option>
          <option value="snack">{t("food.snack")}</option>
        </select>
        <input
          className="field-input"
          type="number"
          min="0"
          value={calories}
          onChange={(event) => setCalories(event.target.value)}
          aria-label={t("common.calories")}
        />
        <button className="btn-secondary" type="button" onClick={() => void logMeal()}>
          <Utensils className="h-4 w-4" aria-hidden="true" />
          {t("recipes.logMeal")}
        </button>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">{translation?.nutritionDisclaimer || t("recipes.disclaimer")}</p>
      <RecipeDetailModal recipe={open ? recipe : null} onClose={() => setOpen(false)} />
    </article>
  );
}
