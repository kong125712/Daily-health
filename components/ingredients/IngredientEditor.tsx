"use client";

import { Plus, Trash2 } from "lucide-react";
import type { RecognizedIngredientInput } from "@/lib/types/domain";
import { useApp } from "@/lib/i18n/I18nProvider";

type IngredientEditorProps = {
  ingredients: RecognizedIngredientInput[];
  onChange: (ingredients: RecognizedIngredientInput[]) => void;
};

const emptyIngredient: RecognizedIngredientInput = {
  normalizedName: "",
  displayNameEn: "",
  displayNameZh: "",
  estimatedAmount: "",
  estimatedCalories: null,
  confidence: "medium",
  notes: ""
};

export function IngredientEditor({ ingredients, onChange }: IngredientEditorProps) {
  const { t } = useApp();

  function update(index: number, patch: Partial<RecognizedIngredientInput>) {
    onChange(ingredients.map((ingredient, current) => (current === index ? { ...ingredient, ...patch } : ingredient)));
  }

  return (
    <section className="panel flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("smart.edit")}</h2>
        <button className="btn-secondary" type="button" onClick={() => onChange([...ingredients, emptyIngredient])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("common.add")}
        </button>
      </div>
      <div className="grid gap-3">
        {ingredients.map((ingredient, index) => (
          <div key={`${ingredient.normalizedName}-${index}`} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1">
                <span className="field-label">{t("smart.normalizedName")}</span>
                <input
                  className="field-input"
                  value={ingredient.normalizedName}
                  onChange={(event) => update(index, { normalizedName: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">{t("smart.displayNameEn")}</span>
                <input
                  className="field-input"
                  value={ingredient.displayNameEn}
                  onChange={(event) => update(index, { displayNameEn: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">{t("smart.displayNameZh")}</span>
                <input
                  className="field-input"
                  value={ingredient.displayNameZh}
                  onChange={(event) => update(index, { displayNameZh: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">{t("smart.estimatedAmount")}</span>
                <input
                  className="field-input"
                  value={ingredient.estimatedAmount}
                  onChange={(event) => update(index, { estimatedAmount: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">{t("smart.estimatedCalories")}</span>
                <input
                  className="field-input"
                  min="0"
                  type="number"
                  value={ingredient.estimatedCalories ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    update(index, { estimatedCalories: value ? Number(value) : null });
                  }}
                />
              </label>
              <label className="grid gap-1">
                <span className="field-label">{t("smart.confidence")}</span>
                <select
                  className="field-input"
                  value={ingredient.confidence}
                  onChange={(event) => update(index, { confidence: event.target.value as RecognizedIngredientInput["confidence"] })}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="grid gap-1 md:col-span-2 xl:col-span-1">
                <span className="field-label">{t("smart.notes")}</span>
                <input
                  className="field-input"
                  value={ingredient.notes}
                  onChange={(event) => update(index, { notes: event.target.value })}
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                className="icon-button"
                type="button"
                title={t("common.delete")}
                onClick={() => onChange(ingredients.filter((_, current) => current !== index))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("common.delete")}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
