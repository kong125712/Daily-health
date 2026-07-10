"use client";

import { Heart, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, isApiErrorWithCode } from "@/lib/client/api";
import { ingredientName } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { AvoidRecipeInput, IngredientScanView, RecipePreferenceInput, RecipeView } from "@/lib/types/domain";
import { EpicurePairingBadge } from "@/components/recipes/EpicurePairingBadge";
import { defaultPreferences, RecipePreferenceForm } from "@/components/recipes/RecipePreferenceForm";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Toast, type ToastState } from "@/components/shared/Toast";

type SourceMode = "latest" | "previous" | "manual" | "recipe";
type EpicureStatus = "connected" | "missing" | "failed" | null;
type GenerateOptions = { overrideRecipeId?: string; refresh?: boolean; allowLocalFallback?: boolean };

const localFallbackCode = "LOCAL_RECIPE_FALLBACK_AVAILABLE";

function manualIngredients(text: string) {
  return text
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      normalizedName: name.toLowerCase(),
      displayNameEn: name,
      displayNameZh: name,
      estimatedAmount: "as available",
      confidence: "medium" as const,
      notes: ""
    }));
}

function recipeAvoidanceSummary(recipe: RecipeView, locale: string): AvoidRecipeInput {
  const localized = recipe.translations.find((translation) => translation.locale === locale);
  const english = recipe.translations.find((translation) => translation.locale === "en");
  const fallback = recipe.translations[0];
  return {
    title: localized?.title ?? english?.title ?? fallback?.title ?? recipe.referenceImageQuery ?? recipe.cuisineStyle,
    cuisineStyle: recipe.cuisineStyle,
    referenceImageQuery: recipe.referenceImageQuery
  };
}

function mergeRecipeById(recipes: RecipeView[], recipe: RecipeView) {
  const exists = recipes.some((item) => item.id === recipe.id);
  if (!exists) {
    return [recipe, ...recipes];
  }
  return recipes.map((item) => (item.id === recipe.id ? recipe : item));
}

export default function RecipesPage() {
  const { profileId, locale, t } = useApp();
  const [sourceMode, setSourceMode] = useState<SourceMode>("latest");
  const [scans, setScans] = useState<IngredientScanView[]>([]);
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<RecipeView[]>([]);
  const [scanId, setScanId] = useState("");
  const [sourceRecipeId, setSourceRecipeId] = useState("");
  const [manualText, setManualText] = useState("");
  const [preferences, setPreferences] = useState<RecipePreferenceInput>(defaultPreferences);
  const [loading, setLoading] = useState(false);
  const [epicureStatus, setEpicureStatus] = useState<EpicureStatus>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingLocalFallback, setPendingLocalFallback] = useState<GenerateOptions | null>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingScanId = params.get("scanId");
    if (incomingScanId) {
      setSourceMode("previous");
      setScanId(incomingScanId);
    }
  }, []);

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      apiFetch<{ scans: IngredientScanView[] }>("/api/ingredient-scans", { profileId, locale }),
      apiFetch<{ recipes: RecipeView[] }>("/api/recipes?favorites=1", { profileId, locale })
    ]).then(([scanResponse, recipeResponse]) => {
      setScans(scanResponse.scans);
      setSavedRecipes(recipeResponse.recipes);
      if (!scanId && scanResponse.scans[0]) {
        setScanId(scanResponse.scans[0].id);
      }
      if (!sourceRecipeId && recipeResponse.recipes[0]) {
        setSourceRecipeId(recipeResponse.recipes[0].id);
      }
    });
  }, [locale, profileId, scanId, sourceRecipeId]);

  async function generate(options: GenerateOptions = {}) {
    if (!profileId) return;
    setLoading(true);
    try {
      const selectedScanId = sourceMode === "latest" ? scans[0]?.id : sourceMode === "previous" ? scanId : undefined;
      const selectedRecipeId = options.overrideRecipeId ?? (sourceMode === "recipe" ? sourceRecipeId : undefined);
      const response = await apiFetch<{ recipes: RecipeView[]; epicureStatus: EpicureStatus }>("/api/generate-recipes", {
        method: "POST",
        profileId,
        locale,
        body: {
          profileId,
          locale,
          scanId: selectedScanId,
          sourceRecipeId: selectedRecipeId,
          manualIngredients: sourceMode === "manual" && !options.overrideRecipeId ? manualIngredients(manualText) : [],
          preferences,
          avoidRecipes: options.refresh ? recipes.map((recipe) => recipeAvoidanceSummary(recipe, locale)) : [],
          refreshNonce: options.refresh ? `${Date.now()}` : undefined,
          allowLocalFallback: Boolean(options.allowLocalFallback)
        }
      });
      setRecipes(response.recipes);
      setEpicureStatus(response.epicureStatus);
    } catch (error) {
      if (isApiErrorWithCode(error, localFallbackCode)) {
        setPendingLocalFallback(options);
        return;
      }
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setLoading(false);
    }
  }

  function handleRecipeChanged(updated: RecipeView) {
    setRecipes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSavedRecipes((current) => (
      updated.isFavorite
        ? mergeRecipeById(current, updated)
        : current.filter((item) => item.id !== updated.id)
    ));
  }

  return (
    <main className="page-shell">
      <Toast toast={toast} />
      <ConfirmDialog
        open={Boolean(pendingLocalFallback)}
        title={t("recipes.localFallbackTitle")}
        message={t("recipes.localFallbackMessage")}
        onCancel={() => setPendingLocalFallback(null)}
        onConfirm={() => {
          const options = pendingLocalFallback ?? {};
          setPendingLocalFallback(null);
          void generate({ ...options, allowLocalFallback: true });
        }}
      />
      <section className="page-header">
        <h1 className="page-title">{t("recipes.title")}</h1>
        <p className="page-subtitle">{t("recipes.subtitle")}</p>
      </section>
      <section className="panel grid gap-4">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("recipes.source")}</h2>
        <div className="grid gap-3 lg:grid-cols-4">
          <select className="field-input" value={sourceMode} onChange={(event) => setSourceMode(event.target.value as SourceMode)}>
            <option value="latest">{t("recipes.latestScan")}</option>
            <option value="previous">{t("recipes.previousScan")}</option>
            <option value="manual">{t("recipes.manual")}</option>
            <option value="recipe">{t("recipes.savedRecipe")}</option>
          </select>
          {sourceMode === "previous" ? (
            <select className="field-input lg:col-span-3" value={scanId} onChange={(event) => setScanId(event.target.value)}>
              {scans.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {new Date(scan.createdAt).toLocaleString()} · {scan.ingredients.map((item) => ingredientName(item, locale)).join(", ")}
                </option>
              ))}
            </select>
          ) : null}
          {sourceMode === "recipe" ? (
            <select className="field-input lg:col-span-3" value={sourceRecipeId} onChange={(event) => setSourceRecipeId(event.target.value)}>
              {savedRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.translations.find((item) => item.locale === locale)?.title ?? recipe.translations[0]?.title}
                </option>
              ))}
            </select>
          ) : null}
          {sourceMode === "manual" ? (
            <textarea
              className="field-input min-h-24 lg:col-span-3"
              value={manualText}
              placeholder={t("recipes.manualPlaceholder")}
              onChange={(event) => setManualText(event.target.value)}
            />
          ) : null}
        </div>
      </section>
      <RecipePreferenceForm value={preferences} onChange={setPreferences} />
      <EpicurePairingBadge status={epicureStatus} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" type="button" onClick={() => void generate()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {t("recipes.generate")}
        </button>
        {recipes.length > 0 ? (
          <button className="btn-secondary" type="button" onClick={() => void generate({ refresh: true })} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {t("recipes.refresh")}
          </button>
        ) : null}
      </div>
      {recipes.length === 0 && !loading ? <EmptyState message={t("recipes.noRecipes")} /> : null}
      <section className="grid gap-4 xl:grid-cols-3">
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onChanged={handleRecipeChanged}
            onSimilar={(selected) => void generate({ overrideRecipeId: selected.id })}
            onToast={showToast}
          />
        ))}
      </section>
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("recipes.savedRecipes")}</h2>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {savedRecipes.length}
          </span>
        </div>
        {savedRecipes.length === 0 ? <EmptyState message={t("myRecipes.empty")} /> : null}
        <div className="grid gap-4 xl:grid-cols-3">
          {savedRecipes.map((recipe) => (
            <RecipeCard
              key={`saved-${recipe.id}`}
              recipe={recipe}
              onChanged={handleRecipeChanged}
              onSimilar={(selected) => void generate({ overrideRecipeId: selected.id })}
              onToast={showToast}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
