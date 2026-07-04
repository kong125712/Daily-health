"use client";

import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { NutritionSummaryView } from "@/lib/types/domain";

const macroRows = [
  {
    key: "protein" as const,
    labelKey: "food.macroProtein" as const,
    color: "bg-emerald-600",
    tint: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
  },
  {
    key: "carbs" as const,
    labelKey: "food.macroCarbs" as const,
    color: "bg-sky-500",
    tint: "bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
  },
  {
    key: "fat" as const,
    labelKey: "food.macroFat" as const,
    color: "bg-amber-500",
    tint: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
  }
];

function macroValue(summary: NutritionSummaryView, key: "protein" | "carbs" | "fat") {
  if (key === "protein") return { grams: summary.proteinGrams, calories: summary.proteinCalories, percent: summary.proteinPercent };
  if (key === "carbs") return { grams: summary.carbsGrams, calories: summary.carbsCalories, percent: summary.carbsPercent };
  return { grams: summary.fatGrams, calories: summary.fatCalories, percent: summary.fatPercent };
}

export function NutritionStructurePanel({ summary }: { summary: NutritionSummaryView }) {
  const { t } = useApp();
  const hasMacros = summary.trackedMacroCalories > 0;

  return (
    <section className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChartNoAxesColumnIncreasing className="h-5 w-5 text-leaf" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("food.nutritionStructure")}</h2>
        </div>
        <div className="text-right text-sm text-slate-500 dark:text-slate-400">
          <p>{t("food.macroTrackedCalories")}: {summary.trackedMacroCalories} kcal</p>
          <p>{t("food.macroTrackedEntries")}: {summary.trackedEntries}</p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
        {hasMacros ? (
          <div className="flex h-full">
            {macroRows.map((row) => {
              const value = macroValue(summary, row.key);
              return <div key={row.key} className={row.color} style={{ width: `${value.percent}%` }} />;
            })}
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {macroRows.map((row) => {
          const value = macroValue(summary, row.key);
          return (
            <div key={row.key} className={`rounded-md p-3 ${row.tint}`}>
              <p className="text-sm font-medium">{t(row.labelKey)}</p>
              <p className="mt-1 text-2xl font-semibold">{value.grams} g</p>
              <p className="text-sm opacity-80">{value.percent}% · {value.calories} kcal</p>
            </div>
          );
        })}
      </div>
      {hasMacros ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t("food.macroUntrackedCalories")}: {summary.untrackedCalories} kcal
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("food.macroEmpty")}</p>
      )}
    </section>
  );
}
