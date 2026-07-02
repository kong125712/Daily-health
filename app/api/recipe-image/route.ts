import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/server/http";

type RecipeImage = {
  url: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: "themealdb" | "wikipedia" | "wikimedia";
};

type WikiPage = {
  title?: string;
  fullurl?: string;
  thumbnail?: { source?: string };
  imageinfo?: Array<{
    mime?: string;
    thumburl?: string;
    url?: string;
    descriptionshorturl?: string;
  }>;
};

type WikiQueryResponse = {
  query?: {
    pages?: Record<string, WikiPage>;
  };
};

type MealDbMeal = {
  idMeal?: string;
  strMeal?: string;
  strMealThumb?: string;
  strSource?: string | null;
};

type MealDbResponse = {
  meals?: MealDbMeal[] | null;
};

const rejectedTitleWords = [
  "logo",
  "map",
  "diagram",
  "chart",
  "poster",
  "menu",
  "restaurant",
  "person",
  "people",
  "market",
  "store",
  "list of"
];

const stopWords = new Set([
  "a",
  "an",
  "and",
  "bowl",
  "dish",
  "easy",
  "food",
  "fresh",
  "healthy",
  "home",
  "homemade",
  "meal",
  "plate",
  "quick",
  "recipe",
  "simple",
  "style",
  "the",
  "with"
]);

export const dynamic = "force-dynamic";

function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/^file:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stemToken(token: string) {
  return token
    .replace(/ies$/i, "y")
    .replace(/oes$/i, "o")
    .replace(/s$/i, "");
}

function tokens(text: string) {
  return normalizeText(text)
    .split(/[\s-]+/)
    .map(stemToken)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function cleanQuery(query: string) {
  return normalizeText(query)
    .split(/[\s-]+/)
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .slice(0, 8)
    .join(" ");
}

function isRejectedTitle(title: string) {
  const normalized = normalizeText(title);
  return rejectedTitleWords.some((word) => normalized.includes(word));
}

function matchScore(query: string, title: string) {
  if (isRejectedTitle(title)) return 0;

  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return 0;

  const titleTokens = new Set(tokens(title));
  const overlap = queryTokens.filter((token) => titleTokens.has(token)).length;
  const neededOverlap = queryTokens.length <= 2 ? 1 : 2;
  if (overlap < neededOverlap) return 0;

  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(query);
  return overlap * 4 + (normalizedTitle.includes(normalizedQuery) ? 6 : 0);
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "DailyHealthRecipeImage/1.0 (https://github.com/kong125712/Daily-health)"
    },
    next: { revalidate: 60 * 60 * 24 * 7 }
  });
  if (!response.ok) return null;
  return (await response.json()) as WikiQueryResponse;
}

async function fetchMealDbJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "DailyHealthRecipeImage/1.0 (https://github.com/kong125712/Daily-health)"
    },
    next: { revalidate: 60 * 60 * 24 * 7 }
  });
  if (!response.ok) return null;
  return (await response.json()) as MealDbResponse;
}

function sortedPages(data: WikiQueryResponse | null, query: string) {
  const pages = Object.values(data?.query?.pages ?? {});
  return pages
    .map((page) => ({ page, score: matchScore(query, page.title ?? "") }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

async function findWikipediaImage(query: string): Promise<RecipeImage | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} food`,
    gsrlimit: "5",
    prop: "pageimages|info",
    piprop: "thumbnail",
    pithumbsize: "1000",
    inprop: "url",
    format: "json",
    origin: "*"
  });
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
  const match = sortedPages(data, query).find((item) => item.page.thumbnail?.source);
  if (!match?.page.thumbnail?.source) return null;
  return {
    url: match.page.thumbnail.source,
    sourceTitle: match.page.title ?? query,
    sourceUrl: match.page.fullurl ?? "https://en.wikipedia.org/",
    provider: "wikipedia"
  };
}

async function findMealDbImage(query: string): Promise<RecipeImage | null> {
  const params = new URLSearchParams({ s: query });
  const data = await fetchMealDbJson(`https://www.themealdb.com/api/json/v1/1/search.php?${params}`);
  const match = (data?.meals ?? [])
    .map((meal) => ({ meal, score: matchScore(query, meal.strMeal ?? "") }))
    .filter((item) => item.score > 0 && item.meal.strMealThumb)
    .sort((left, right) => right.score - left.score)[0];

  if (!match?.meal.strMealThumb) return null;
  return {
    url: match.meal.strMealThumb,
    sourceTitle: match.meal.strMeal ?? query,
    sourceUrl: match.meal.strSource || `https://www.themealdb.com/meal/${match.meal.idMeal ?? ""}`,
    provider: "themealdb"
  };
}

async function findWikimediaImage(query: string): Promise<RecipeImage | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query} food`,
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "1000",
    format: "json",
    origin: "*"
  });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const match = sortedPages(data, query).find((item) => {
    const image = item.page.imageinfo?.[0];
    return image?.thumburl && image.mime?.startsWith("image/");
  });
  const image = match?.page.imageinfo?.[0];
  if (!match || !image?.thumburl) return null;
  return {
    url: image.thumburl,
    sourceTitle: match.page.title ?? query,
    sourceUrl: image.descriptionshorturl ?? image.url ?? "https://commons.wikimedia.org/",
    provider: "wikimedia"
  };
}

function queryCandidates(request: NextRequest) {
  const queries = request.nextUrl.searchParams
    .getAll("q")
    .flatMap((query) => query.split("|"))
    .map(cleanQuery)
    .filter(Boolean);
  return Array.from(new Set(queries)).slice(0, 6);
}

export async function GET(request: NextRequest) {
  const queries = queryCandidates(request);
  for (const query of queries) {
    try {
      const mealDbImage = await findMealDbImage(query);
      if (mealDbImage) return jsonOk({ image: mealDbImage });

      const wikipediaImage = await findWikipediaImage(query);
      if (wikipediaImage) return jsonOk({ image: wikipediaImage });

      const wikimediaImage = await findWikimediaImage(query);
      if (wikimediaImage) return jsonOk({ image: wikimediaImage });
    } catch (error) {
      console.warn("Recipe image lookup failed", { query, error });
    }
  }

  return jsonOk({ image: null });
}
