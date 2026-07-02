import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/server/http";

type RecipeImageProvider = "themealdb" | "wikipedia" | "wikimedia";

type RecipeImage = {
  url: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: RecipeImageProvider;
  aiSelected?: boolean;
  aiReason?: string;
};

type RecipeImageCandidate = RecipeImage & {
  query: string;
  score: number;
};

type RecipeImageContext = {
  title?: string;
  referenceImageQuery?: string | null;
  cuisineStyle?: string | null;
  ingredients?: string[];
  queries?: string[];
  locale?: string;
};

type AiSelectionResult = {
  selectedIndex: number | null;
  confidence?: "high" | "medium" | "low";
  reason?: string;
};

type AiQueryResult = {
  queries?: string[];
  reason?: string;
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
export const runtime = "nodejs";

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

function uniqueCleanQueries(queries: Array<string | null | undefined>) {
  return Array.from(new Set(queries.map((query) => cleanQuery(query ?? "")).filter(Boolean))).slice(0, 8);
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

async function findWikipediaImages(query: string): Promise<RecipeImageCandidate[]> {
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
  return sortedPages(data, query)
    .filter((item) => item.page.thumbnail?.source)
    .slice(0, 3)
    .map((item) => ({
      url: item.page.thumbnail?.source ?? "",
      sourceTitle: item.page.title ?? query,
      sourceUrl: item.page.fullurl ?? "https://en.wikipedia.org/",
      provider: "wikipedia",
      query,
      score: item.score
    }));
}

async function findMealDbImages(query: string): Promise<RecipeImageCandidate[]> {
  const params = new URLSearchParams({ s: query });
  const data = await fetchMealDbJson(`https://www.themealdb.com/api/json/v1/1/search.php?${params}`);
  return (data?.meals ?? [])
    .map((meal) => ({ meal, score: matchScore(query, meal.strMeal ?? "") }))
    .filter((item) => item.score > 0 && item.meal.strMealThumb)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => ({
      url: item.meal.strMealThumb ?? "",
      sourceTitle: item.meal.strMeal ?? query,
      sourceUrl: item.meal.strSource || `https://www.themealdb.com/meal/${item.meal.idMeal ?? ""}`,
      provider: "themealdb",
      query,
      score: item.score + 4
    }));
}

async function findWikimediaImages(query: string): Promise<RecipeImageCandidate[]> {
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
  return sortedPages(data, query)
    .filter((item) => {
      const image = item.page.imageinfo?.[0];
      return image?.thumburl && image.mime?.startsWith("image/");
    })
    .slice(0, 3)
    .map((item) => {
      const image = item.page.imageinfo?.[0];
      return {
        url: image?.thumburl ?? "",
        sourceTitle: item.page.title ?? query,
        sourceUrl: image?.descriptionshorturl ?? image?.url ?? "https://commons.wikimedia.org/",
        provider: "wikimedia",
        query,
        score: item.score
      };
    });
}

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function getGeminiModelName() {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
}

function recipeContextQueries(context: RecipeImageContext) {
  const ingredientText = context.ingredients?.slice(0, 4).join(" ") ?? "";
  return uniqueCleanQueries([
    ...(context.queries ?? []),
    context.referenceImageQuery,
    context.title,
    context.referenceImageQuery && context.cuisineStyle ? `${context.referenceImageQuery} ${context.cuisineStyle}` : null,
    context.title && ingredientText ? `${context.title} ${ingredientText}` : null
  ]);
}

function dedupeCandidates(candidates: RecipeImageCandidate[]) {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = normalizeText(`${candidate.provider}:${candidate.sourceTitle}:${candidate.url}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.score - left.score);
}

async function collectImageCandidates(queries: string[]) {
  const mealDbCandidates = (await Promise.all(queries.map((query) => findMealDbImages(query)))).flat();
  let candidates = dedupeCandidates(mealDbCandidates);
  if (candidates.length >= 4) return candidates.slice(0, 8);

  const wikipediaCandidates = (await Promise.all(queries.map((query) => findWikipediaImages(query)))).flat();
  candidates = dedupeCandidates([...candidates, ...wikipediaCandidates]);
  if (candidates.length >= 4) return candidates.slice(0, 8);

  const wikimediaCandidates = (await Promise.all(queries.map((query) => findWikimediaImages(query)))).flat();
  return dedupeCandidates([...candidates, ...wikimediaCandidates]).slice(0, 8);
}

function toRecipeImage(candidate: RecipeImageCandidate, aiReason?: string): RecipeImage {
  return {
    url: candidate.url,
    sourceTitle: candidate.sourceTitle,
    sourceUrl: candidate.sourceUrl,
    provider: candidate.provider,
    aiSelected: Boolean(aiReason),
    aiReason
  };
}

async function imagePartFromUrl(candidate: RecipeImageCandidate) {
  const response = await fetch(candidate.url, {
    headers: {
      accept: "image/*",
      "user-agent": "DailyHealthRecipeImage/1.0 (https://github.com/kong125712/Daily-health)"
    },
    next: { revalidate: 60 * 60 * 24 * 7 }
  });
  if (!response.ok) return null;

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  if (!mimeType.startsWith("image/")) return null;

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2_500_000) return null;

  return {
    inlineData: {
      mimeType,
      data: Buffer.from(bytes).toString("base64")
    }
  };
}

async function selectImageWithGemini(context: RecipeImageContext, candidates: RecipeImageCandidate[]) {
  const genAI = getGeminiClient();
  if (!genAI) return null;

  const visibleCandidates = candidates.slice(0, 4);
  const candidateParts = (await Promise.all(
    visibleCandidates.map(async (candidate, index) => {
      const imagePart = await imagePartFromUrl(candidate);
      if (!imagePart) return null;
      return [
        {
          text: [
            `Candidate ${index + 1}`,
            `Source title: ${candidate.sourceTitle}`,
            `Search query: ${candidate.query}`,
            `Provider: ${candidate.provider}`
          ].join("\n")
        },
        imagePart
      ];
    })
  )).flat().filter(Boolean) as Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;

  if (candidateParts.length === 0) return null;

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const prompt = [
    "Select the best reference image for a generated recipe.",
    "First infer what the finished dish should look like from the recipe context.",
    "Then inspect the candidate images and choose only a candidate that visually matches the finished dish.",
    "Reject images that show a different dish, raw ingredients, packaging, people, menus, logos, or a vague food scene.",
    "If none of the images are a good match, return selectedIndex null.",
    "",
    "Recipe context:",
    `Title: ${context.title ?? ""}`,
    `Reference image query: ${context.referenceImageQuery ?? ""}`,
    `Cuisine style: ${context.cuisineStyle ?? ""}`,
    `Main ingredients: ${(context.ingredients ?? []).join(", ")}`,
    "",
    "Return JSON only with this exact shape:",
    JSON.stringify({ selectedIndex: 1, confidence: "high | medium | low", reason: "short reason" })
  ].join("\n");

  const result = await model.generateContent([{ text: prompt }, ...candidateParts]);
  const parsed = parseJsonFromText(result.response.text()) as Partial<AiSelectionResult>;
  const selectedIndex = typeof parsed.selectedIndex === "number" ? parsed.selectedIndex : null;
  if (selectedIndex == null || selectedIndex < 1 || selectedIndex > visibleCandidates.length) return null;
  if (parsed.confidence === "low") return null;

  const selected = visibleCandidates[selectedIndex - 1];
  return toRecipeImage(selected, parsed.reason ?? "AI selected the closest matching finished dish image.");
}

async function generateImageSearchQueriesWithGemini(
  context: RecipeImageContext,
  rejectedCandidates: RecipeImageCandidate[]
) {
  const genAI = getGeminiClient();
  if (!genAI) return [];

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const prompt = [
    "The current recipe image candidates were not a good visual match.",
    "Infer the finished dish from the recipe context, then create better English image-search queries.",
    "Use common dish names, alternate English names, ingredient-order variants, and cuisine-specific names.",
    "Keep each query 2 to 7 words. Do not include brands, website names, punctuation, or words like recipe/photo/image.",
    "Prefer exact finished-dish names over broad ingredient lists.",
    "",
    "Recipe context:",
    `Title: ${context.title ?? ""}`,
    `Reference image query: ${context.referenceImageQuery ?? ""}`,
    `Cuisine style: ${context.cuisineStyle ?? ""}`,
    `Main ingredients: ${(context.ingredients ?? []).join(", ")}`,
    "",
    "Rejected candidate titles:",
    rejectedCandidates.slice(0, 8).map((candidate) => `- ${candidate.sourceTitle} (${candidate.query})`).join("\n") || "None",
    "",
    "Return JSON only with this exact shape:",
    JSON.stringify({ queries: ["chinese tomato egg stir fry", "scrambled eggs with tomatoes"], reason: "short reason" })
  ].join("\n");

  const result = await model.generateContent(prompt);
  const parsed = parseJsonFromText(result.response.text()) as Partial<AiQueryResult>;
  if (!Array.isArray(parsed.queries)) return [];
  return uniqueCleanQueries(parsed.queries.filter((query): query is string => typeof query === "string"));
}

async function resolveRecipeImage(context: RecipeImageContext, useAi: boolean) {
  const queries = recipeContextQueries(context);
  const candidates = await collectImageCandidates(queries);
  if (candidates.length === 0 && !useAi) return null;

  if (useAi) {
    try {
      if (candidates.length > 0) {
        const aiImage = await selectImageWithGemini(context, candidates);
        if (aiImage) return aiImage;
      }

      const refinedQueries = await generateImageSearchQueriesWithGemini(context, candidates);
      const newQueries = refinedQueries.filter((query) => !queries.includes(query));
      if (newQueries.length > 0) {
        const refinedCandidates = dedupeCandidates([
          ...candidates,
          ...(await collectImageCandidates(newQueries))
        ]);
        const refinedAiImage = await selectImageWithGemini(context, refinedCandidates);
        if (refinedAiImage) return refinedAiImage;
      }

      if (candidates.length > 0 && !getGeminiClient()) {
        return toRecipeImage(candidates[0]);
      }
      return null;
    } catch (error) {
      console.warn("AI recipe image selection failed", error);
      if (candidates.length > 0) return toRecipeImage(candidates[0]);
    }
  }

  return candidates.length > 0 ? toRecipeImage(candidates[0]) : null;
}

function queryCandidates(request: NextRequest) {
  return uniqueCleanQueries(request.nextUrl.searchParams
    .getAll("q")
    .flatMap((query) => query.split("|")));
}

function contextFromBody(body: unknown): RecipeImageContext {
  if (typeof body !== "object" || body === null) return {};
  const record = body as Record<string, unknown>;
  return {
    title: typeof record.title === "string" ? record.title : undefined,
    referenceImageQuery: typeof record.referenceImageQuery === "string" ? record.referenceImageQuery : null,
    cuisineStyle: typeof record.cuisineStyle === "string" ? record.cuisineStyle : null,
    ingredients: Array.isArray(record.ingredients) ? record.ingredients.filter((ingredient): ingredient is string => typeof ingredient === "string") : [],
    queries: Array.isArray(record.queries) ? record.queries.filter((query): query is string => typeof query === "string") : [],
    locale: typeof record.locale === "string" ? record.locale : undefined
  };
}

export async function GET(request: NextRequest) {
  try {
    const image = await resolveRecipeImage({ queries: queryCandidates(request) }, false);
    return jsonOk({ image });
  } catch (error) {
    console.warn("Recipe image lookup failed", error);
    return jsonOk({ image: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = contextFromBody(await request.json());
    const image = await resolveRecipeImage(context, true);
    return jsonOk({ image });
  } catch (error) {
    console.warn("AI recipe image lookup failed", error);
    return jsonOk({ image: null });
  }
}
