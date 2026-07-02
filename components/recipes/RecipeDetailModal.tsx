"use client";

import { X } from "lucide-react";
import { ingredientName, recipeTranslation } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { RecipeView } from "@/lib/types/domain";
import { RecipeReferenceImage } from "./RecipeReferenceImage";

export function RecipeDetailModal({ recipe, onClose }: { recipe: RecipeView | null; onClose: () => void }) {
  const { locale, t } = useApp();
  if (!recipe) {
    return null;
  }
  const translation = recipeTranslation(recipe, locale);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto my-8 max-w-3xl rounded-md bg-white p-5 shadow-soft dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">{translation?.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{translation?.shortDescription}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("common.close")}>
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t("common.close")}</span>
          </button>
        </div>
        <div className="mt-5">
          <RecipeReferenceImage recipe={recipe} />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section>
            <h3 className="font-semibold text-slate-950 dark:text-white">{t("recipes.ingredients")}</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id} className="flex justify-between gap-3">
                  <span>{ingredientName(ingredient, locale)}</span>
                  <span className="text-slate-500">{ingredient.amount}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold text-slate-950 dark:text-white">{t("recipes.missing")}</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {recipe.missingIngredients.map((ingredient) => (
                <li key={ingredient.id}>{ingredientName(ingredient, locale)}</li>
              ))}
            </ul>
          </section>
        </div>
        <section className="mt-5">
          <h3 className="font-semibold text-slate-950 dark:text-white">{t("recipes.steps")}</h3>
          <ol className="mt-2 space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {recipe.steps.map((step) => (
              <li key={step.id}>
                <span className="font-semibold">{step.stepNumber}. </span>
                {locale === "zh-CN" ? step.instructionZh || step.instructionEn : step.instructionEn || step.instructionZh}
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-5">
          <h3 className="font-semibold text-slate-950 dark:text-white">{t("recipes.tips")}</h3>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {recipe.tips.map((tip) => (
              <li key={tip.id}>{locale === "zh-CN" ? tip.contentZh || tip.contentEn : tip.contentEn || tip.contentZh}</li>
            ))}
          </ul>
        </section>
        <p className="mt-5 text-xs leading-5 text-slate-500">{translation?.nutritionDisclaimer || t("recipes.disclaimer")}</p>
      </div>
    </div>
  );
}
