"use client";

import { useState } from "react";
import { ingredientName, recipeTranslation } from "@/lib/client/display";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { RecipeView } from "@/lib/types/domain";

type RecipeReferenceImageProps = {
  recipe: RecipeView;
  compact?: boolean;
};

const fallbackPhotos = [
  {
    keywords: ["salad", "vegetable", "vegetarian", "light", "greens"],
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["rice", "fried rice", "malaysian", "chinese", "wok"],
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["noodle", "ramen", "soup", "japanese", "korean"],
    url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["egg", "breakfast", "toast"],
    url: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["pizza", "oven", "western", "cheese"],
    url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["chicken", "meat", "protein", "grilled"],
    url: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["seafood", "fish", "shrimp"],
    url: "https://images.unsplash.com/photo-1559847844-d721426d6edc?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["stew", "curry", "thai", "sauce"],
    url: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: ["dessert", "sweet", "fruit"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80"
  },
  {
    keywords: [],
    url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"
  }
];

function hashText(text: string) {
  return Array.from(text).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
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

function imageSearchText(recipe: RecipeView, locale: "en" | "zh-CN") {
  const englishTitle = recipeTranslation(recipe, "en")?.title;
  const localizedTitle = recipeTranslation(recipe, locale)?.title;
  const ingredients = recipe.ingredients
    .slice(0, 3)
    .map((ingredient) => ingredientName(ingredient, "en"))
    .join(" ");
  const searchText = cleanSearchText([
    englishTitle,
    recipe.referenceImageQuery,
    localizedTitle,
    recipe.cuisineStyle,
    ingredients
  ].filter(Boolean).join(" "));
  return searchText || "home cooked food";
}

function specificPhotoUrl(recipe: RecipeView, locale: "en" | "zh-CN") {
  const searchText = imageSearchText(recipe, locale);
  const lock = Math.abs(hashText(`${recipe.id}:${searchText}`)) % 100000;
  return `https://loremflickr.com/1200/900/${encodeURIComponent(`${searchText} food dish`)}?lock=${lock}`;
}

function pickFallbackPhoto(recipe: RecipeView, locale: "en" | "zh-CN") {
  const text = imageSearchText(recipe, locale).toLowerCase();
  const matched = fallbackPhotos.find((photo) =>
    photo.keywords.some((keyword) => text.includes(keyword))
  );
  if (matched) {
    return matched.url;
  }

  const generalPhotos = fallbackPhotos.filter((photo) => photo.keywords.length > 0);
  return generalPhotos[Math.abs(hashText(text)) % generalPhotos.length]?.url ?? fallbackPhotos[fallbackPhotos.length - 1].url;
}

export function RecipeReferenceImage({ recipe, compact = false }: RecipeReferenceImageProps) {
  const { locale, t } = useApp();
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const translation = recipeTranslation(recipe, locale);
  const title = translation?.title ?? recipe.referenceImageQuery ?? recipe.cuisineStyle;
  const primaryImageUrl = specificPhotoUrl(recipe, locale);
  const fallbackImageUrl = pickFallbackPhoto(recipe, locale);
  const imageUrl = failedUrls.includes(primaryImageUrl)
    ? failedUrls.includes(fallbackImageUrl)
      ? null
      : fallbackImageUrl
    : primaryImageUrl;

  return (
    <div className={`relative overflow-hidden rounded-md bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950 ${compact ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
      {imageUrl ? (
        <img
          alt={`${title} ${t("recipes.referenceImage")}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={imageUrl}
          onError={() => setFailedUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl])}
        />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-3 text-white">
        <p className="text-xs font-semibold uppercase tracking-normal opacity-90">{t("recipes.referenceImage")}</p>
        <p className="line-clamp-1 text-sm font-semibold">{title}</p>
      </div>
    </div>
  );
}
