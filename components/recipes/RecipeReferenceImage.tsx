"use client";

import { ImageOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ingredientName, recipeTranslation } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { AppLocale, RecipeView } from "@/lib/types/domain";

type RecipeReferenceImageProps = {
  recipe: RecipeView;
  compact?: boolean;
};

type ResolvedRecipeImage = {
  url: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: "themealdb" | "wikipedia" | "wikimedia";
};

type RecipeImageResponse = {
  image: ResolvedRecipeImage | null;
};

type ImageStatus = "loading" | "ready" | "empty";

function cleanSearchText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\b(recipe|healthy|easy|quick|simple|homemade|style|with|and|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

function uniqueQueries(queries: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      queries
        .map((query) => cleanSearchText(query ?? ""))
        .filter((query) => query.length > 2)
    )
  ).slice(0, 6);
}

function recipeImageQueries(recipe: RecipeView, locale: AppLocale) {
  const englishTitle = recipeTranslation(recipe, "en")?.title;
  const localizedTitle = recipeTranslation(recipe, locale)?.title;
  const ingredients = recipe.ingredients
    .slice(0, 3)
    .map((ingredient) => ingredientName(ingredient, "en"))
    .join(" ");

  return uniqueQueries([
    recipe.referenceImageQuery,
    englishTitle,
    localizedTitle,
    recipe.referenceImageQuery ? `${recipe.referenceImageQuery} ${recipe.cuisineStyle}` : null,
    englishTitle ? `${englishTitle} ${ingredients}` : null
  ]);
}

async function fetchRecipeImage(queries: string[]) {
  const params = new URLSearchParams();
  for (const query of queries) {
    params.append("q", query);
  }

  const response = await fetch(`/api/recipe-image?${params}`, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) return null;

  const data = (await response.json()) as RecipeImageResponse;
  return data.image;
}

export function RecipeReferenceImage({ recipe, compact = false }: RecipeReferenceImageProps) {
  const { locale, t } = useApp();
  const translation = recipeTranslation(recipe, locale);
  const title = translation?.title ?? recipe.referenceImageQuery ?? recipe.cuisineStyle;
  const queries = useMemo(() => recipeImageQueries(recipe, locale), [locale, recipe]);
  const queryKey = queries.join("|");
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [image, setImage] = useState<ResolvedRecipeImage | null>(null);

  useEffect(() => {
    let isActive = true;
    setStatus("loading");
    setImage(null);

    if (queries.length === 0) {
      setStatus("empty");
      return () => {
        isActive = false;
      };
    }

    fetchRecipeImage(queries)
      .then((resolvedImage) => {
        if (!isActive) return;
        setImage(resolvedImage);
        setStatus(resolvedImage ? "ready" : "empty");
      })
      .catch(() => {
        if (!isActive) return;
        setImage(null);
        setStatus("empty");
      });

    return () => {
      isActive = false;
    };
  }, [queryKey, queries]);

  return (
    <div className={`relative overflow-hidden rounded-md bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950 ${compact ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
      {status === "ready" && image ? (
        <img
          alt={`${title} ${t("recipes.referenceImage")}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={image.url}
          onError={() => {
            setImage(null);
            setStatus("empty");
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-5 text-center text-slate-700 dark:text-slate-200">
          {status === "loading" ? (
            <Loader2 className="h-7 w-7 animate-spin text-leaf dark:text-emerald-300" aria-hidden="true" />
          ) : (
            <ImageOff className="h-8 w-8 text-leaf dark:text-emerald-300" aria-hidden="true" />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-leaf dark:text-emerald-300">{t("recipes.referenceImage")}</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
          </div>
        </div>
      )}
      {status === "ready" && image ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-3 text-white">
          <p className="text-xs font-semibold uppercase tracking-normal opacity-90">{t("recipes.referenceImage")}</p>
          <p className="line-clamp-1 text-sm font-semibold">{title}</p>
        </div>
      ) : null}
    </div>
  );
}
