"use client";

import { Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { FoodLogView, MealCategory } from "@/lib/types/domain";
import { useApp } from "@/lib/i18n/I18nProvider";

type FoodFormState = {
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

const emptyState: FoodFormState = {
  nameEn: "",
  nameZh: "",
  calories: "",
  proteinGrams: "",
  carbsGrams: "",
  fatGrams: "",
  notes: "",
  mealCategory: "breakfast"
};

export function FoodLogForm({
  editing,
  onSubmit,
  onEstimate,
  onCancel
}: {
  editing: FoodLogView | null;
  onSubmit: (value: FoodFormState) => void;
  onEstimate: (value: FoodFormState) => Promise<Partial<Pick<FoodFormState, "calories" | "proteinGrams" | "carbsGrams" | "fatGrams">>>;
  onCancel: () => void;
}) {
  const { t } = useApp();
  const [form, setForm] = useState<FoodFormState>(emptyState);
  const [expanded, setExpanded] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState("");

  useEffect(() => {
    if (editing) {
      setExpanded(true);
    }
    setForm(
      editing
        ? {
            id: editing.id,
            nameEn: editing.nameEn,
            nameZh: editing.nameZh ?? editing.nameEn,
            calories: editing.calories?.toString() ?? "",
            proteinGrams: editing.proteinGrams?.toString() ?? "",
            carbsGrams: editing.carbsGrams?.toString() ?? "",
            fatGrams: editing.fatGrams?.toString() ?? "",
            notes: editing.notes ?? "",
            mealCategory: editing.mealCategory
          }
        : emptyState
    );
  }, [editing]);

  function closeForm() {
    setForm(emptyState);
    setEstimateError("");
    setExpanded(false);
    onCancel();
  }

  if (!expanded && !editing) {
    return (
      <section className="panel flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("food.addManual")}</h2>
        <button className="btn-primary" type="button" onClick={() => setExpanded(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("common.add")}
        </button>
      </section>
    );
  }

  async function estimateNutrition() {
    if (!form.nameEn.trim()) return;
    setEstimating(true);
    setEstimateError("");
    try {
      const estimate = await onEstimate(form);
      setForm((current) => ({
        ...current,
        calories: estimate.calories ?? current.calories,
        proteinGrams: estimate.proteinGrams ?? current.proteinGrams,
        carbsGrams: estimate.carbsGrams ?? current.carbsGrams,
        fatGrams: estimate.fatGrams ?? current.fatGrams
      }));
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setEstimating(false);
    }
  }

  return (
    <form
      className="panel grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
        if (!editing) {
          setForm(emptyState);
          setExpanded(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("food.addManual")}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1">
          <span className="field-label">{t("common.name")}</span>
          <input
            className="field-input"
            required
            value={form.nameEn}
            onChange={(event) => setForm({ ...form, nameEn: event.target.value, nameZh: event.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("food.meal")}</span>
          <select className="field-input" value={form.mealCategory} onChange={(event) => setForm({ ...form, mealCategory: event.target.value as MealCategory })}>
            <option value="breakfast">{t("food.breakfast")}</option>
            <option value="lunch">{t("food.lunch")}</option>
            <option value="dinner">{t("food.dinner")}</option>
            <option value="snack">{t("food.snack")}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("common.calories")}</span>
          <input className="field-input" min="0" type="number" value={form.calories} onChange={(event) => setForm({ ...form, calories: event.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("food.macroProtein")}</span>
          <input className="field-input" min="0" step="0.1" type="number" value={form.proteinGrams} onChange={(event) => setForm({ ...form, proteinGrams: event.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("food.macroCarbs")}</span>
          <input className="field-input" min="0" step="0.1" type="number" value={form.carbsGrams} onChange={(event) => setForm({ ...form, carbsGrams: event.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("food.macroFat")}</span>
          <input className="field-input" min="0" step="0.1" type="number" value={form.fatGrams} onChange={(event) => setForm({ ...form, fatGrams: event.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("common.notes")}</span>
          <input className="field-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" type="submit">
          {editing ? t("common.update") : t("common.add")}
        </button>
        <button className="btn-secondary" type="button" disabled={!form.nameEn.trim() || estimating} onClick={() => void estimateNutrition()}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {estimating ? t("food.estimatingNutrition") : t("food.estimateNutrition")}
        </button>
        <button className="btn-secondary" type="button" onClick={closeForm}>
          {t("common.cancel")}
        </button>
      </div>
      {estimateError ? <p className="text-sm text-rose-600 dark:text-rose-300">{estimateError}</p> : null}
    </form>
  );
}
