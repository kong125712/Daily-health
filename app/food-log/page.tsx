"use client";

import Link from "next/link";
import { Pencil, Target, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { ingredientName, isoToday, mealCategoryKey } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { CalorieGuidanceView, FoodLogView, FoodNutritionEstimate, MealCategory, NutritionSummaryView } from "@/lib/types/domain";
import { FoodLogForm } from "@/components/health/FoodLogForm";
import { NutritionStructurePanel } from "@/components/health/NutritionStructurePanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { Toast, type ToastState } from "@/components/shared/Toast";

type FormValue = {
  id?: string;
  nameEn: string;
  nameZh: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  notes: string;
  mealCategory: MealCategory;
};

const categories: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

export default function FoodLogPage() {
  const { profileId, locale, t } = useApp();
  const [date, setDate] = useState(isoToday());
  const [logs, setLogs] = useState<FoodLogView[]>([]);
  const [total, setTotal] = useState(0);
  const [nutritionSummary, setNutritionSummary] = useState<NutritionSummaryView | null>(null);
  const [calorieGuidance, setCalorieGuidance] = useState<CalorieGuidanceView | null>(null);
  const [editing, setEditing] = useState<FoodLogView | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    if (!profileId) return;
    const response = await apiFetch<{
      logs: FoodLogView[];
      total: number;
      calorieGuidance: CalorieGuidanceView;
      nutritionSummary: NutritionSummaryView;
    }>(`/api/food-logs?date=${date}`, { profileId, locale });
    setLogs(response.logs);
    setTotal(response.total);
    setNutritionSummary(response.nutritionSummary);
    setCalorieGuidance(response.calorieGuidance);
  }, [date, locale, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(value: FormValue) {
    if (!profileId) return;
    try {
      await apiFetch<{ log: FoodLogView }>("/api/food-logs", {
        method: value.id ? "PATCH" : "POST",
        profileId,
        locale,
        body: {
          id: value.id,
          profileId,
          date,
          mealCategory: value.mealCategory,
          nameEn: value.nameEn,
          nameZh: value.nameZh || value.nameEn,
          calories: value.calories ? Number(value.calories) : null,
          proteinGrams: value.proteinGrams ? Number(value.proteinGrams) : null,
          carbsGrams: value.carbsGrams ? Number(value.carbsGrams) : null,
          fatGrams: value.fatGrams ? Number(value.fatGrams) : null,
          notes: value.notes,
          sourceType: "manual"
        }
      });
      setEditing(null);
      showToast(t("common.success"), "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    }
  }

  async function estimateNutrition(value: FormValue) {
    if (!profileId) {
      throw new Error(t("common.error"));
    }

    const response = await apiFetch<{ estimate: FoodNutritionEstimate }>("/api/estimate-nutrition", {
      method: "POST",
      profileId,
      locale,
      body: {
        profileId,
        locale,
        nameEn: value.nameEn,
        nameZh: value.nameZh || value.nameEn,
        calories: value.calories ? Number(value.calories) : null,
        notes: value.notes
      }
    });

    showToast(t("food.nutritionEstimated"), "success");
    return {
      calories: response.estimate.calories == null ? "" : response.estimate.calories.toString(),
      proteinGrams: response.estimate.proteinGrams == null ? "" : response.estimate.proteinGrams.toString(),
      carbsGrams: response.estimate.carbsGrams == null ? "" : response.estimate.carbsGrams.toString(),
      fatGrams: response.estimate.fatGrams == null ? "" : response.estimate.fatGrams.toString()
    };
  }

  async function remove(log: FoodLogView) {
    if (!profileId) return;
    await apiFetch<{ deleted: boolean }>("/api/food-logs", {
      method: "DELETE",
      profileId,
      locale,
      body: { profileId, id: log.id }
    });
    await load();
  }

  return (
    <main className="page-shell">
      <Toast toast={toast} />
      <section className="page-header">
        <h1 className="page-title">{t("food.title")}</h1>
      </section>
      <label className="grid max-w-xs gap-1">
        <span className="field-label">{t("common.date")}</span>
        <input className="field-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <FoodLogForm editing={editing} onSubmit={(value) => void submit(value)} onEstimate={(value) => estimateNutrition(value)} onCancel={() => setEditing(null)} />
      {nutritionSummary ? <NutritionStructurePanel summary={nutritionSummary} /> : null}
      <section className="panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("food.dailyTotal")}</h2>
          </div>
          <div className="text-right">
            <span className="block text-2xl font-semibold text-leaf">{total} kcal</span>
            <span className="text-sm text-slate-500 dark:text-slate-300">
              {calorieGuidance?.targetCalories ? `${t("food.dailyTarget")}: ${calorieGuidance.targetCalories} kcal` : t("food.profileNeeded")}
            </span>
          </div>
        </div>
        {calorieGuidance && !calorieGuidance.profileComplete ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
            <p>{locale === "zh-CN" ? calorieGuidance.calculationNoteZh : calorieGuidance.calculationNoteEn}</p>
            <Link href="/profile" className="mt-2 inline-flex font-semibold text-leaf hover:underline">
              {t("food.completeProfile")}
            </Link>
          </div>
        ) : null}
        {calorieGuidance?.isOverTarget ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
            <p className="font-semibold">
              {t("food.overTarget")} {calorieGuidance.excessCalories} kcal
            </p>
            <ul className="mt-2 grid gap-1">
              {(locale === "zh-CN" ? calorieGuidance.adviceZh : calorieGuidance.adviceEn).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : calorieGuidance?.targetCalories ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
            {t("food.remainingToday")} {calorieGuidance.remainingCalories} kcal
          </div>
        ) : null}
        {logs.length === 0 ? (
          <EmptyState message={t("food.empty")} />
        ) : (
          <div className="grid gap-4">
            {categories.map((category) => {
              const items = logs.filter((log) => log.mealCategory === category);
              return (
                <section key={category} className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <h3 className="font-semibold text-slate-950 dark:text-white">{t(mealCategoryKey(category))}</h3>
                  <div className="mt-2 grid gap-2">
                    {items.map((log) => (
                      <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3 dark:bg-slate-900">
                        <div>
                          <p className="font-medium text-slate-950 dark:text-white">{ingredientName({ nameEn: log.nameEn, nameZh: log.nameZh ?? "" }, locale)}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {log.calories ?? 0} kcal · {t("food.macroProtein")} {log.proteinGrams ?? 0} g · {t("food.macroCarbs")} {log.carbsGrams ?? 0} g · {t("food.macroFat")} {log.fatGrams ?? 0} g
                          </p>
                          {log.notes ? <p className="text-sm text-slate-500 dark:text-slate-400">{log.notes}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <button className="icon-button" type="button" title={t("common.edit")} onClick={() => setEditing(log)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">{t("common.edit")}</span>
                          </button>
                          <button className="icon-button" type="button" title={t("common.delete")} onClick={() => void remove(log)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">{t("common.delete")}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
