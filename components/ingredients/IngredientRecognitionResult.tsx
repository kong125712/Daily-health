"use client";

import { ingredientName } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { IngredientScanView } from "@/lib/types/domain";
import { EmptyState } from "@/components/shared/EmptyState";

export function IngredientRecognitionResult({ scan }: { scan: IngredientScanView }) {
  const { locale, t } = useApp();
  const uncertainty = locale === "zh-CN" ? scan.uncertaintyNoteZh || scan.uncertaintyNoteEn : scan.uncertaintyNoteEn || scan.uncertaintyNoteZh;
  const totalCalories = scan.ingredients.reduce((sum, ingredient) => sum + (ingredient.estimatedCalories ?? 0), 0);
  const hasCalorieEstimate = scan.ingredients.some((ingredient) => ingredient.estimatedCalories != null);

  return (
    <section className="panel flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("smart.result")}</h2>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-skyglass px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {t("smart.confidence")}: {scan.overallConfidence}
          </span>
          {hasCalorieEstimate ? (
            <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100">
              {t("smart.totalCalories")}: {totalCalories} kcal
            </span>
          ) : null}
        </div>
      </div>
      {uncertainty ? <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{uncertainty}</p> : null}
      {scan.ingredients.length === 0 ? (
        <EmptyState message={t("smart.noFood")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scan.ingredients.map((ingredient) => (
            <article key={ingredient.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <h3 className="font-semibold text-slate-950 dark:text-white">{ingredientName(ingredient, locale)}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{ingredient.estimatedAmount}</p>
              {ingredient.estimatedCalories != null ? (
                <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {ingredient.estimatedCalories} kcal
                </p>
              ) : null}
              <p className="mt-2 text-xs uppercase tracking-normal text-slate-500">{ingredient.confidence}</p>
              {ingredient.notes ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{ingredient.notes}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
