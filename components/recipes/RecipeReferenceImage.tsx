"use client";

import { ImageOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { ingredientName, recipeTranslation } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { AppLocale, RecipeReferenceImageView, RecipeView } from "@/lib/types/domain";

type RecipeReferenceImageProps = {
  recipe: RecipeView;
  compact?: boolean;
  onResolved?: (image: RecipeReferenceImageView | null) => void;
};

type ResolvedRecipeImage = RecipeReferenceImageView;

type RecipeImageResponse = {
  image: ResolvedRecipeImage | null;
};

type ImageStatus = "loading" | "ready" | "empty";

type ClaimedImage = {
  url: string;
  sourceTitle: string;
};

const claimedImages = new Map<string, ClaimedImage>();

function claimedUrlsForOtherRecipes(recipeId: string) {
  return Array.from(claimedImages.entries())
    .filter(([claimedRecipeId]) => claimedRecipeId !== recipeId)
    .map(([, image]) => image.url);
}

function claimedSourceTitlesForOtherRecipes(recipeId: string) {
  return Array.from(claimedImages.entries())
    .filter(([claimedRecipeId]) => claimedRecipeId !== recipeId)
    .map(([, image]) => image.sourceTitle);
}

function claimImage(recipeId: string, image: ResolvedRecipeImage) {
  const duplicateOwner = Array.from(claimedImages.entries())
    .find(([claimedRecipeId, claimedImage]) =>
      claimedRecipeId !== recipeId &&
      (claimedImage.url === image.url || claimedImage.sourceTitle === image.sourceTitle)
    );
  if (duplicateOwner) return false;

  claimedImages.set(recipeId, {
    url: image.url,
    sourceTitle: image.sourceTitle
  });
  return true;
}

function releaseImage(recipeId: string, image?: ClaimedImage | null) {
  const claimedImage = claimedImages.get(recipeId);
  if (!image || claimedImage?.url === image.url) {
    claimedImages.delete(recipeId);
  }
}

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

function recipeImageInfo(recipe: RecipeView, locale: AppLocale) {
  const englishTitle = recipeTranslation(recipe, "en")?.title;
  const localizedTitle = recipeTranslation(recipe, locale)?.title;
  const englishDescription = recipeTranslation(recipe, "en")?.shortDescription;
  const localizedDescription = recipeTranslation(recipe, locale)?.shortDescription;
  const ingredients = recipe.ingredients
    .map((ingredient) => ingredientName(ingredient, "en"))
    .map((name, index) => {
      const amount = recipe.ingredients[index]?.amount;
      return amount ? `${name} (${amount})` : name;
    })
    .filter(Boolean);
  const steps = [...recipe.steps]
    .sort((left, right) => left.stepNumber - right.stepNumber)
    .map((step) => step.instructionEn || step.instructionZh)
    .filter(Boolean);
  const tips = recipe.tips
    .map((tip) => tip.contentEn || tip.contentZh)
    .filter(Boolean);

  const queries = uniqueQueries([
    recipe.referenceImageQuery,
    englishTitle,
    localizedTitle,
    recipe.referenceImageQuery ? `${recipe.referenceImageQuery} ${recipe.cuisineStyle}` : null,
    englishTitle ? `${englishTitle} ${ingredients.slice(0, 5).join(" ")}` : null
  ]);

  return {
    title: englishTitle ?? localizedTitle ?? recipe.referenceImageQuery ?? recipe.cuisineStyle,
    localizedTitle,
    shortDescription: englishDescription ?? localizedDescription,
    referenceImageQuery: recipe.referenceImageQuery,
    cuisineStyle: recipe.cuisineStyle,
    ingredients,
    steps,
    tips,
    queries
  };
}

async function fetchRecipeImage(
  recipe: RecipeView,
  locale: AppLocale,
  profileId: string | null,
  excludeUrls: string[] = [],
  excludeSourceTitles: string[] = []
) {
  const info = recipeImageInfo(recipe, locale);
  try {
    const data = await apiFetch<RecipeImageResponse>("/api/recipe-image", {
      method: "POST",
      profileId,
      locale,
      body: {
      ...info,
      excludeUrls,
      excludeSourceTitles,
      locale
      }
    });
    return data.image;
  } catch {
    return null;
  }
}

export function RecipeReferenceImage({ recipe, compact = false, onResolved }: RecipeReferenceImageProps) {
  const { locale, profileId, t } = useApp();
  const translation = recipeTranslation(recipe, locale);
  const title = translation?.title ?? recipe.referenceImageQuery ?? recipe.cuisineStyle;
  const pinnedImage = recipe.referenceImage;
  const imageInfo = useMemo(() => recipeImageInfo(recipe, locale), [locale, recipe]);
  const queryKey = JSON.stringify(imageInfo);
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [image, setImage] = useState<ResolvedRecipeImage | null>(null);
  const claimedImageRef = useRef<ClaimedImage | null>(null);

  useEffect(() => {
    let isActive = true;

    if (pinnedImage) {
      releaseImage(recipe.id, claimedImageRef.current);
      claimedImageRef.current = null;
      setImage(pinnedImage);
      setStatus("ready");
      onResolved?.(pinnedImage);
      return () => {
        isActive = false;
      };
    }

    releaseImage(recipe.id, claimedImageRef.current);
    claimedImageRef.current = null;
    setStatus("loading");
    setImage(null);
    onResolved?.(null);

    if (imageInfo.queries.length === 0) {
      setStatus("empty");
      onResolved?.(null);
      return () => {
        isActive = false;
      };
    }

    async function loadImage() {
      const initialExcludeUrls = claimedUrlsForOtherRecipes(recipe.id);
      const initialExcludeSourceTitles = claimedSourceTitlesForOtherRecipes(recipe.id);
      const resolvedImage = await fetchRecipeImage(recipe, locale, profileId, initialExcludeUrls, initialExcludeSourceTitles);
      if (!isActive) return;

      if (!resolvedImage) {
        setImage(null);
        setStatus("empty");
        onResolved?.(null);
        return;
      }

      if (claimImage(recipe.id, resolvedImage)) {
        claimedImageRef.current = {
          url: resolvedImage.url,
          sourceTitle: resolvedImage.sourceTitle
        };
        setImage(resolvedImage);
        setStatus("ready");
        onResolved?.(resolvedImage);
        return;
      }

      const retryExcludeUrls = Array.from(new Set([...initialExcludeUrls, resolvedImage.url]));
      const retryExcludeSourceTitles = Array.from(new Set([...initialExcludeSourceTitles, resolvedImage.sourceTitle]));
      const retryImage = await fetchRecipeImage(recipe, locale, profileId, retryExcludeUrls, retryExcludeSourceTitles);
      if (!isActive) return;

      if (retryImage && claimImage(recipe.id, retryImage)) {
        claimedImageRef.current = {
          url: retryImage.url,
          sourceTitle: retryImage.sourceTitle
        };
        setImage(retryImage);
        setStatus("ready");
        onResolved?.(retryImage);
        return;
      }

      setImage(null);
      setStatus("empty");
      onResolved?.(null);
    }

    void loadImage()
      .catch(() => {
        if (!isActive) return;
        setImage(null);
        setStatus("empty");
        onResolved?.(null);
      });

    return () => {
      isActive = false;
      releaseImage(recipe.id, claimedImageRef.current);
      claimedImageRef.current = null;
    };
  }, [locale, onResolved, pinnedImage, profileId, queryKey, recipe, imageInfo.queries.length]);

  return (
    <div className={`relative overflow-hidden rounded-md bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950 ${compact ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
      {status === "ready" && image ? (
        <img
          alt={`${title} ${t("recipes.referenceImage")}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={image.url}
          style={{
            objectPosition: image.crop ? `${image.crop.xPercent}% ${image.crop.yPercent}%` : undefined,
            transform: image.crop ? `scale(${image.crop.zoom})` : undefined,
            transformOrigin: image.crop ? `${image.crop.xPercent}% ${image.crop.yPercent}%` : undefined
          }}
          onError={() => {
            releaseImage(recipe.id, claimedImageRef.current);
            claimedImageRef.current = null;
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
