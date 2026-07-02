import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/server/http";

type RecipeImageProvider = "ai" | "local" | "themealdb" | "wikipedia" | "wikimedia";

type RecipeImage = {
  url: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: RecipeImageProvider;
  crop?: {
    xPercent: number;
    yPercent: number;
    zoom: number;
  };
  aiSelected?: boolean;
  aiReason?: string;
};

type RecipeImageCandidate = RecipeImage & {
  query: string;
  score: number;
};

type RecipeImageContext = {
  title?: string;
  localizedTitle?: string | null;
  shortDescription?: string | null;
  referenceImageQuery?: string | null;
  cuisineStyle?: string | null;
  ingredients?: string[];
  steps?: string[];
  tips?: string[];
  queries?: string[];
  excludeUrls?: string[];
  excludeSourceTitles?: string[];
  locale?: string;
};

type AiSelectionResult = {
  selectedIndex: number | null;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  crop?: {
    xPercent?: number;
    yPercent?: number;
    zoom?: number;
  };
};

type AiQueryResult = {
  queries?: string[];
  reason?: string;
};

type LocalImagePromptPlan = {
  prompt: string;
  negativePrompt: string;
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

type GeminiImageBlock = {
  data: string;
  mimeType: string;
};

type ComfyUiImageInfo = {
  filename: string;
  subfolder?: string;
  type?: string;
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

const generatedImageCache = new Map<string, RecipeImage>();
const maxGeneratedImageCacheItems = 24;
let localImageGenerationQueue = Promise.resolve();

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
  return process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
}

function getGeminiImageModelNames() {
  const configuredModel = process.env.GEMINI_IMAGE_MODEL?.trim();
  return Array.from(new Set([
    configuredModel,
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image"
  ].filter((model): model is string => Boolean(model))));
}

function getRecipeImageProvider() {
  const provider = process.env.RECIPE_IMAGE_PROVIDER?.trim().toLowerCase();
  if (provider === "gemini" || provider === "local") return provider;
  return "local";
}

function getSdWebUiUrl() {
  return (process.env.SD_WEBUI_URL?.trim() || "http://127.0.0.1:7860").replace(/\/+$/, "");
}

function getComfyUiUrl() {
  return (process.env.COMFYUI_URL?.trim() || "http://127.0.0.1:8188").replace(/\/+$/, "");
}

function getLocalImageApi() {
  const localApi = process.env.LOCAL_IMAGE_API?.trim().toLowerCase();
  if (localApi === "sdwebui" || localApi === "comfyui") return localApi;
  return "comfyui";
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(clamp(parsed, min, max));
}

function floatEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(process.env[name] ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
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

function recipeImageCacheKey(context: RecipeImageContext, provider: string) {
  return `${provider}:${normalizeText([
    context.title,
    context.localizedTitle,
    context.shortDescription,
    context.referenceImageQuery,
    context.cuisineStyle,
    ...(context.ingredients ?? []),
    ...(context.steps ?? []),
    ...(context.tips ?? []),
    ...(context.queries ?? [])
  ].filter(Boolean).join("|")).slice(0, 700)}`;
}

function setGeneratedImageCache(key: string, image: RecipeImage) {
  if (!key) return;
  generatedImageCache.set(key, image);
  while (generatedImageCache.size > maxGeneratedImageCacheItems) {
    const firstKey = generatedImageCache.keys().next().value;
    if (!firstKey) break;
    generatedImageCache.delete(firstKey);
  }
}

function generatedDishImagePrompt(context: RecipeImageContext) {
  const title = context.title ?? context.referenceImageQuery ?? context.queries?.[0] ?? "healthy home-cooked dish";
  const ingredients = (context.ingredients ?? []).slice(0, 8);

  return [
    "Create one photorealistic reference image for a health recipe app.",
    "The image must show exactly one finished cooked dish as the clear main subject.",
    "Use a tight crop around one plate, bowl, or serving container with the whole dish visible.",
    "Do not show multiple dishes, raw ingredient piles, packaging, menus, logos, text, people, hands, utensils covering the food, or a busy table spread.",
    "No labels, no watermark, no typography, no decorative frame.",
    "Make the food match the recipe title, cuisine style, and main ingredients. If the context is uncertain, infer a realistic finished version from the title and ingredients.",
    "Use natural light, appetizing but realistic plating, and a neutral simple background.",
    "",
    "Recipe context:",
    `Title: ${title}`,
    `Reference dish query: ${context.referenceImageQuery ?? ""}`,
    `Cuisine style: ${context.cuisineStyle ?? ""}`,
    `Main ingredients: ${ingredients.join(", ") || "not specified"}`
  ].join("\n");
}

function safePromptText(value: string | null | undefined, maxLength = 400) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function recipeVisualContext(context: RecipeImageContext) {
  return [
    `English title: ${safePromptText(context.title)}`,
    `Localized title: ${safePromptText(context.localizedTitle)}`,
    `Reference dish query: ${safePromptText(context.referenceImageQuery)}`,
    `Cuisine style: ${safePromptText(context.cuisineStyle)}`,
    `Short description: ${safePromptText(context.shortDescription, 700)}`,
    `Ingredients with amounts: ${(context.ingredients ?? []).slice(0, 12).map((ingredient) => safePromptText(ingredient, 120)).join("; ")}`,
    `Cooking steps: ${(context.steps ?? []).slice(0, 6).map((step) => safePromptText(step, 220)).join(" | ")}`,
    `Tips: ${(context.tips ?? []).slice(0, 3).map((tip) => safePromptText(tip, 180)).join(" | ")}`
  ].join("\n");
}

function fallbackLocalImagePromptPlan(context: RecipeImageContext): LocalImagePromptPlan {
  const title = safePromptText(context.title) || safePromptText(context.referenceImageQuery) || "healthy home-cooked dish";
  const localizedTitle = safePromptText(context.localizedTitle);
  const description = safePromptText(context.shortDescription, 220);
  const ingredients = (context.ingredients ?? []).slice(0, 10).map((ingredient) => safePromptText(ingredient, 80)).filter(Boolean);
  const steps = (context.steps ?? []).slice(0, 4).map((step) => safePromptText(step, 120)).filter(Boolean);
  const cuisine = safePromptText(context.cuisineStyle);

  return {
    prompt: [
      "professional realistic restaurant menu food photography",
      "one finished cooked dish only",
      "entire plate or bowl fully visible inside the frame",
      "medium distance composition",
      "45 degree angle or gentle overhead view",
      "centered dish with small clean margin around the plate",
      "no cropped edges",
      "natural soft light",
      "simple neutral tabletop",
      "realistic home cooked plating",
      `dish name: ${title}`,
      localizedTitle ? `also known as: ${localizedTitle}` : "",
      cuisine ? `${cuisine} cuisine` : "",
      description ? `finished dish description: ${description}` : "",
      ingredients.length > 0 ? `visible cooked ingredients: ${ingredients.join(", ")}` : "",
      steps.length > 0 ? `cooking method cues: ${steps.join("; ")}` : ""
    ].filter(Boolean).join(", "),
    negativePrompt: stableDiffusionNegativePrompt()
  };
}

function parsePromptPlan(text: string): LocalImagePromptPlan | null {
  const parsed = parseJsonFromText(text) as Partial<LocalImagePromptPlan>;
  if (typeof parsed.prompt !== "string" || parsed.prompt.trim().length < 40) return null;

  return {
    prompt: parsed.prompt.trim().slice(0, 1200),
    negativePrompt: typeof parsed.negativePrompt === "string" && parsed.negativePrompt.trim()
      ? parsed.negativePrompt.trim().slice(0, 900)
      : stableDiffusionNegativePrompt(),
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : undefined
  };
}

async function generateLocalImagePromptPlanWithGemini(context: RecipeImageContext) {
  const genAI = getGeminiClient();
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.15
    }
  });

  const prompt = [
    "You are writing a precise SDXL / ComfyUI prompt for a recipe reference photo.",
    "Infer the final plated dish from the full recipe context, not just the title.",
    "Write a concrete English food-photography prompt that makes the generated image match the actual recipe.",
    "Include the final cooking method, visible cooked ingredients, texture, sauce or garnish, plate/bowl type, and plating style.",
    "The composition must show exactly one complete finished dish. The entire plate or bowl must be visible, with no cropped edges and no extreme close-up.",
    "Do not invent a different dish. Do not request text, labels, packaging, people, hands, or multiple dishes.",
    "Keep the prompt suitable for SDXL: comma-separated visual phrases, 70 to 130 words.",
    "",
    "Recipe context:",
    recipeVisualContext(context),
    "",
    "Return JSON only with this exact shape:",
    JSON.stringify({
      prompt: "professional realistic restaurant menu food photo, one complete finished dish...",
      negativePrompt: "cropped edges, extreme close-up, raw ingredients, multiple dishes, text, watermark...",
      reason: "short reason"
    })
  ].join("\n");

  try {
    const result = await model.generateContent(prompt);
    return parsePromptPlan(result.response.text());
  } catch (error) {
    console.warn("Gemini recipe image prompt planning failed", error);
    return null;
  }
}

async function localImagePromptPlan(context: RecipeImageContext) {
  const plannedPrompt = await generateLocalImagePromptPlanWithGemini(context);
  return plannedPrompt ?? fallbackLocalImagePromptPlan(context);
}

function stableDiffusionNegativePrompt() {
  return [
    process.env.SD_IMAGE_NEGATIVE_PROMPT?.trim(),
    "extreme close-up",
    "macro photo",
    "cropped dish",
    "cut off plate",
    "partial plate",
    "plate outside frame",
    "zoomed in",
    "multiple dishes",
    "several plates",
    "raw ingredients",
    "ingredient pile",
    "people",
    "hands",
    "face",
    "menu",
    "packaging",
    "logo",
    "watermark",
    "text",
    "caption",
    "bad crop",
    "blurry",
    "low quality",
    "deformed food",
    "messy table"
  ].filter(Boolean).join(", ");
}

function sdWebUiHeaders() {
  const auth = process.env.SD_WEBUI_AUTH?.trim();
  return {
    "content-type": "application/json",
    ...(auth ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {})
  };
}

function comfyUiHeaders(includeJson = true) {
  const auth = process.env.COMFYUI_AUTH?.trim();
  return {
    ...(includeJson ? { "content-type": "application/json" } : {}),
    ...(auth ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {})
  };
}

function stripDataImagePrefix(imageData: string) {
  return imageData.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
}

async function requestGeneratedImageFromSdWebUi(context: RecipeImageContext, promptPlan: LocalImagePromptPlan) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), integerEnv("SD_IMAGE_TIMEOUT_MS", 120_000, 10_000, 600_000));

  try {
    const response = await fetch(`${getSdWebUiUrl()}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: sdWebUiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        prompt: promptPlan.prompt,
        negative_prompt: promptPlan.negativePrompt,
        sampler_name: process.env.SD_IMAGE_SAMPLER?.trim() || "Euler a",
        steps: integerEnv("SD_IMAGE_STEPS", 18, 1, 80),
        cfg_scale: floatEnv("SD_IMAGE_CFG_SCALE", 6, 1, 20),
        width: integerEnv("SD_IMAGE_WIDTH", 768, 256, 1536),
        height: integerEnv("SD_IMAGE_HEIGHT", 576, 256, 1536),
        batch_size: 1,
        n_iter: 1,
        seed: integerEnv("SD_IMAGE_SEED", -1, -1, 2_147_483_647),
        restore_faces: false,
        tiling: false,
        save_images: false
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(`Local recipe image generation failed: ${response.status} ${text.slice(0, 300)}`);
      return null;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.images) || typeof payload.images[0] !== "string") {
      console.warn("Local recipe image generation returned an unexpected response.");
      return null;
    }

    return {
      data: stripDataImagePrefix(payload.images[0]),
      mimeType: "image/png"
    };
  } catch (error) {
    console.warn("Local recipe image generation request failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateRecipeImageWithLocalSd(context: RecipeImageContext, promptPlan: LocalImagePromptPlan) {
  const cacheKey = recipeImageCacheKey(context, "local-sd");
  if (generatedImageCache.has(cacheKey)) {
    return generatedImageCache.get(cacheKey) ?? null;
  }

  const imageBlock = await requestGeneratedImageFromSdWebUi(context, promptPlan);
  if (!imageBlock) return null;

  const title = context.title ?? context.referenceImageQuery ?? context.queries?.[0] ?? "Generated dish";
  const image: RecipeImage = {
    url: `data:${imageBlock.mimeType};base64,${imageBlock.data}`,
    sourceTitle: `${title} local AI generated reference`,
    sourceUrl: getSdWebUiUrl(),
    provider: "local",
    aiSelected: true,
    aiReason: promptPlan.reason ?? "Generated from the full recipe context with local Stable Diffusion WebUI."
  };
  setGeneratedImageCache(cacheKey, image);
  return image;
}

function imageDimensionEnv(primaryName: string, fallbackName: string, fallback: number) {
  const value = integerEnv(primaryName, integerEnv(fallbackName, fallback, 256, 1536), 256, 1536);
  return Math.round(value / 8) * 8;
}

function comfyUiSeed() {
  const configured = integerEnv("COMFYUI_SEED", integerEnv("SD_IMAGE_SEED", -1, -1, 2_147_483_647), -1, 2_147_483_647);
  return configured >= 0 ? configured : Math.floor(Math.random() * 2_147_483_647);
}

function comfyUiSampler() {
  return process.env.COMFYUI_SAMPLER?.trim() || "euler";
}

function comfyUiScheduler() {
  return process.env.COMFYUI_SCHEDULER?.trim() || "normal";
}

async function getComfyUiCheckpoint() {
  const configured = process.env.COMFYUI_CHECKPOINT?.trim();
  if (configured) return configured;

  try {
    const response = await fetch(`${getComfyUiUrl()}/object_info/CheckpointLoaderSimple`, {
      headers: comfyUiHeaders(false)
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as {
      CheckpointLoaderSimple?: {
        input?: {
          required?: {
            ckpt_name?: unknown;
          };
        };
      };
    } | null;
    const ckptName = payload?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
    const choices = Array.isArray(ckptName) && Array.isArray(ckptName[0]) ? ckptName[0] : [];
    return choices.find((choice): choice is string => typeof choice === "string") ?? null;
  } catch (error) {
    console.warn("Could not read ComfyUI checkpoint list", error);
    return null;
  }
}

function comfyUiWorkflow(context: RecipeImageContext, ckptName: string, promptPlan: LocalImagePromptPlan) {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: comfyUiSeed(),
        steps: integerEnv("COMFYUI_STEPS", integerEnv("SD_IMAGE_STEPS", 18, 1, 80), 1, 80),
        cfg: floatEnv("COMFYUI_CFG_SCALE", floatEnv("SD_IMAGE_CFG_SCALE", 6, 1, 20), 1, 20),
        sampler_name: comfyUiSampler(),
        scheduler: comfyUiScheduler(),
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      }
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: ckptName
      }
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: imageDimensionEnv("COMFYUI_IMAGE_WIDTH", "SD_IMAGE_WIDTH", 768),
        height: imageDimensionEnv("COMFYUI_IMAGE_HEIGHT", "SD_IMAGE_HEIGHT", 576),
        batch_size: 1
      }
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: promptPlan.prompt,
        clip: ["4", 1]
      }
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: promptPlan.negativePrompt,
        clip: ["4", 1]
      }
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2]
      }
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "daily_health_recipe",
        images: ["8", 0]
      }
    }
  };
}

async function queueComfyUiPrompt(context: RecipeImageContext, promptPlan: LocalImagePromptPlan) {
  const ckptName = await getComfyUiCheckpoint();
  if (!ckptName) {
    console.warn("ComfyUI is unavailable or no checkpoint was found.");
    return null;
  }

  const response = await fetch(`${getComfyUiUrl()}/prompt`, {
    method: "POST",
    headers: comfyUiHeaders(),
    body: JSON.stringify({
      client_id: `daily-health-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      prompt: comfyUiWorkflow(context, ckptName, promptPlan)
    })
  });
  const payload = (await response.json().catch(() => null)) as { prompt_id?: unknown } | null;
  if (!response.ok || typeof payload?.prompt_id !== "string") {
    console.warn(`ComfyUI prompt queue failed: ${response.status}`);
    return null;
  }

  return payload.prompt_id;
}

function comfyUiImageInfoFromRecord(value: unknown): ComfyUiImageInfo | null {
  if (!isRecord(value) || typeof value.filename !== "string") return null;
  return {
    filename: value.filename,
    subfolder: typeof value.subfolder === "string" ? value.subfolder : undefined,
    type: typeof value.type === "string" ? value.type : undefined
  };
}

function findComfyUiImages(value: unknown, depth = 0): ComfyUiImageInfo[] {
  if (depth > 8) return [];

  if (isRecord(value) && Array.isArray(value.images)) {
    const images = value.images
      .map(comfyUiImageInfoFromRecord)
      .filter((image): image is ComfyUiImageInfo => Boolean(image));
    if (images.length > 0) return images;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findComfyUiImages(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((child) => findComfyUiImages(child, depth + 1));
  }

  return [];
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollComfyUiImage(promptId: string) {
  const timeoutMs = integerEnv("COMFYUI_TIMEOUT_MS", 300_000, 10_000, 900_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await wait(1000);
    const response = await fetch(`${getComfyUiUrl()}/history/${encodeURIComponent(promptId)}`, {
      headers: comfyUiHeaders(false)
    });
    if (!response.ok) continue;

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const historyItem = payload?.[promptId];
    const image = findComfyUiImages(historyItem)[0];
    if (image) return image;
  }

  console.warn("ComfyUI image generation timed out.");
  return null;
}

async function fetchComfyUiImage(image: ComfyUiImageInfo) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? "",
    type: image.type ?? "output"
  });
  const response = await fetch(`${getComfyUiUrl()}/view?${params}`, {
    headers: comfyUiHeaders(false)
  });
  if (!response.ok) return null;

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/png";
  const bytes = await response.arrayBuffer();
  return {
    data: Buffer.from(bytes).toString("base64"),
    mimeType: mimeType.startsWith("image/") ? mimeType : "image/png"
  };
}

async function requestGeneratedImageFromComfyUi(context: RecipeImageContext, promptPlan: LocalImagePromptPlan) {
  try {
    const promptId = await queueComfyUiPrompt(context, promptPlan);
    if (!promptId) return null;

    const imageInfo = await pollComfyUiImage(promptId);
    if (!imageInfo) return null;

    return await fetchComfyUiImage(imageInfo);
  } catch (error) {
    console.warn("ComfyUI recipe image generation request failed", error);
    return null;
  }
}

async function generateRecipeImageWithComfyUi(context: RecipeImageContext, promptPlan: LocalImagePromptPlan) {
  const cacheKey = recipeImageCacheKey(context, "local-comfyui");
  if (generatedImageCache.has(cacheKey)) {
    return generatedImageCache.get(cacheKey) ?? null;
  }

  const imageBlock = await requestGeneratedImageFromComfyUi(context, promptPlan);
  if (!imageBlock) return null;

  const title = context.title ?? context.referenceImageQuery ?? context.queries?.[0] ?? "Generated dish";
  const image: RecipeImage = {
    url: `data:${imageBlock.mimeType};base64,${imageBlock.data}`,
    sourceTitle: `${title} ComfyUI generated reference`,
    sourceUrl: getComfyUiUrl(),
    provider: "local",
    aiSelected: true,
    aiReason: promptPlan.reason ?? "Generated from the full recipe context with local ComfyUI."
  };
  setGeneratedImageCache(cacheKey, image);
  return image;
}

async function runQueuedLocalImageGeneration(job: () => Promise<RecipeImage | null>) {
  const queuedJob = localImageGenerationQueue.catch(() => undefined).then(job);
  localImageGenerationQueue = queuedJob.then(() => undefined, () => undefined);
  return queuedJob;
}

async function generateRecipeImageWithLocalProvider(context: RecipeImageContext) {
  const promptPlan = await localImagePromptPlan(context);
  return runQueuedLocalImageGeneration(() => {
    if (getLocalImageApi() === "sdwebui") return generateRecipeImageWithLocalSd(context, promptPlan);
    return generateRecipeImageWithComfyUi(context, promptPlan);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function imageBlockFromRecord(value: unknown): GeminiImageBlock | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  const data = value.data;
  const mimeType = value.mime_type ?? value.mimeType;
  if (type !== "image" || typeof data !== "string") return null;

  return {
    data,
    mimeType: typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "image/jpeg"
  };
}

function findImageBlockDeep(value: unknown, depth = 0): GeminiImageBlock | null {
  if (depth > 8) return null;

  const imageBlock = imageBlockFromRecord(value);
  if (imageBlock) return imageBlock;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageBlockDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      const found = findImageBlockDeep(child, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function findGeneratedImageBlock(payload: unknown): GeminiImageBlock | null {
  if (!isRecord(payload)) return null;

  const outputImage = imageBlockFromRecord(payload.output_image ?? payload.outputImage);
  return outputImage ?? findImageBlockDeep(payload);
}

function geminiApiErrorText(payload: unknown) {
  if (!isRecord(payload)) return "unknown error";
  const error = payload.error;
  if (!isRecord(error)) return "unknown error";
  return typeof error.message === "string" ? error.message : "unknown error";
}

async function requestGeneratedImageFromGemini(model: string, prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model,
      input: [{ type: "text", text: prompt }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "4:3",
        image_size: "512"
      },
      generation_config: {
        temperature: 0.15
      },
      store: false
    })
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    console.warn(`Gemini recipe image generation failed with ${model}: ${response.status} ${geminiApiErrorText(payload)}`);
    return null;
  }

  return findGeneratedImageBlock(payload);
}

async function generateRecipeImageWithGemini(context: RecipeImageContext) {
  if (!process.env.GEMINI_API_KEY) return null;

  const cacheKey = recipeImageCacheKey(context, "gemini");
  if (generatedImageCache.has(cacheKey)) {
    return generatedImageCache.get(cacheKey) ?? null;
  }

  const prompt = generatedDishImagePrompt(context);
  for (const model of getGeminiImageModelNames()) {
    const imageBlock = await requestGeneratedImageFromGemini(model, prompt);
    if (!imageBlock) continue;

    const title = context.title ?? context.referenceImageQuery ?? context.queries?.[0] ?? "Generated dish";
    const image: RecipeImage = {
      url: `data:${imageBlock.mimeType};base64,${imageBlock.data}`,
      sourceTitle: `${title} AI generated reference`,
      sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
      provider: "ai",
      aiSelected: true,
      aiReason: `Generated from the recipe context with ${model}.`
    };
    setGeneratedImageCache(cacheKey, image);
    return image;
  }

  return null;
}

async function generateRecipeImage(context: RecipeImageContext) {
  if (getRecipeImageProvider() === "gemini") return generateRecipeImageWithGemini(context);
  return generateRecipeImageWithLocalProvider(context);
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

function excludedSet(values: string[] | undefined) {
  return new Set((values ?? []).map(normalizeText).filter(Boolean));
}

function filterExcludedCandidates(candidates: RecipeImageCandidate[], context: RecipeImageContext) {
  const excludedUrls = excludedSet(context.excludeUrls);
  const excludedTitles = excludedSet(context.excludeSourceTitles);
  if (excludedUrls.size === 0 && excludedTitles.size === 0) return candidates;

  return candidates.filter((candidate) => {
    const normalizedUrl = normalizeText(candidate.url);
    const normalizedTitle = normalizeText(candidate.sourceTitle);
    return !excludedUrls.has(normalizedUrl) && !excludedTitles.has(normalizedTitle);
  });
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedCrop(crop: AiSelectionResult["crop"]) {
  if (!crop) return undefined;
  return {
    xPercent: clamp(typeof crop.xPercent === "number" ? crop.xPercent : 50, 0, 100),
    yPercent: clamp(typeof crop.yPercent === "number" ? crop.yPercent : 50, 0, 100),
    zoom: clamp(typeof crop.zoom === "number" ? crop.zoom : 1, 1, 2.8)
  };
}

function toRecipeImage(
  candidate: RecipeImageCandidate,
  aiReason?: string,
  crop?: AiSelectionResult["crop"]
): RecipeImage {
  return {
    url: candidate.url,
    sourceTitle: candidate.sourceTitle,
    sourceUrl: candidate.sourceUrl,
    provider: candidate.provider,
    crop: normalizedCrop(crop),
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
    "Then inspect the candidate images and choose only a candidate that visually matches the finished dish and can be displayed as exactly one finished dish.",
    "Reject images that show a different dish, raw ingredients, packaging, people, menus, logos, a vague food scene, or multiple finished dishes that cannot be tightly cropped to a single dish.",
    "If the image contains surrounding tableware or multiple nearby items, provide crop values that center and zoom the single finished dish only.",
    "If none of the images are a good match, return selectedIndex null.",
    "",
    "Recipe context:",
    `Title: ${context.title ?? ""}`,
    `Reference image query: ${context.referenceImageQuery ?? ""}`,
    `Cuisine style: ${context.cuisineStyle ?? ""}`,
    `Main ingredients: ${(context.ingredients ?? []).join(", ")}`,
    "",
    "Return JSON only with this exact shape:",
    JSON.stringify({
      selectedIndex: 1,
      confidence: "high | medium | low",
      reason: "short reason",
      crop: { xPercent: 50, yPercent: 50, zoom: 1.2 }
    })
  ].join("\n");

  const result = await model.generateContent([{ text: prompt }, ...candidateParts]);
  const parsed = parseJsonFromText(result.response.text()) as Partial<AiSelectionResult>;
  const selectedIndex = typeof parsed.selectedIndex === "number" ? parsed.selectedIndex : null;
  if (selectedIndex == null || selectedIndex < 1 || selectedIndex > visibleCandidates.length) return null;
  if (parsed.confidence === "low") return null;

  const selected = visibleCandidates[selectedIndex - 1];
  return toRecipeImage(
    selected,
    parsed.reason ?? "AI selected the closest matching finished dish image.",
    parsed.crop
  );
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
  const candidates = filterExcludedCandidates(await collectImageCandidates(queries), context);
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
        const refinedCandidates = filterExcludedCandidates(dedupeCandidates([
          ...candidates,
          ...(await collectImageCandidates(newQueries))
        ]), context);
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
    localizedTitle: typeof record.localizedTitle === "string" ? record.localizedTitle : null,
    shortDescription: typeof record.shortDescription === "string" ? record.shortDescription : null,
    referenceImageQuery: typeof record.referenceImageQuery === "string" ? record.referenceImageQuery : null,
    cuisineStyle: typeof record.cuisineStyle === "string" ? record.cuisineStyle : null,
    ingredients: Array.isArray(record.ingredients) ? record.ingredients.filter((ingredient): ingredient is string => typeof ingredient === "string") : [],
    steps: Array.isArray(record.steps) ? record.steps.filter((step): step is string => typeof step === "string") : [],
    tips: Array.isArray(record.tips) ? record.tips.filter((tip): tip is string => typeof tip === "string") : [],
    queries: Array.isArray(record.queries) ? record.queries.filter((query): query is string => typeof query === "string") : [],
    excludeUrls: Array.isArray(record.excludeUrls) ? record.excludeUrls.filter((url): url is string => typeof url === "string") : [],
    excludeSourceTitles: Array.isArray(record.excludeSourceTitles) ? record.excludeSourceTitles.filter((title): title is string => typeof title === "string") : [],
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
    const image = await generateRecipeImage(context);
    return jsonOk({ image });
  } catch (error) {
    console.warn("AI recipe image generation failed", error);
    return jsonOk({ image: null });
  }
}
