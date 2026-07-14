import { prisma } from "@/lib/db";
import type { ServiceStatusItem, ServiceStatusResponse, ServiceStatusState } from "@/lib/types/domain";
import { DEFAULT_EPICURE_MCP_URL } from "@/lib/services/epicureService";
import { defaultAiProvider, resolveAiConfiguration, resolveGeminiApiKey } from "@/lib/services/aiConfiguration";

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasEnv(name: string) {
  return Boolean(envValue(name));
}

function maskedConfigured(name: string) {
  return hasEnv(name) ? "configured" : "missing";
}

function zhConfigured(name: string) {
  return hasEnv(name) ? "已配置" : "未配置";
}

function recipeImageProvider() {
  const provider = envValue("RECIPE_IMAGE_PROVIDER").toLowerCase();
  return provider === "disabled" || provider === "gemini" || provider === "local" || provider === "replicate" ? provider : "local";
}

function localImageApi() {
  const api = envValue("LOCAL_IMAGE_API").toLowerCase();
  return api === "sdwebui" || api === "comfyui" ? api : "comfyui";
}

function comfyUiUrl() {
  return (envValue("COMFYUI_URL") || "http://127.0.0.1:8188").replace(/\/+$/, "");
}

function sdWebUiUrl() {
  return (envValue("SD_WEBUI_URL") || "http://127.0.0.1:7860").replace(/\/+$/, "");
}

function replicateImageModel() {
  return envValue("REPLICATE_IMAGE_MODEL") || "black-forest-labs/flux-schnell";
}

function mealDbKey() {
  return envValue("THEMEALDB_API_KEY") || "1";
}

function aiProvider() {
  return envValue("AI_PROVIDER").toLowerCase() === "gemini" ? "gemini" : "openai";
}

function aiModel() {
  return aiProvider() === "gemini" ? envValue("GEMINI_MODEL") || "gemini-3.1-flash-lite" : "gpt-4o-mini";
}

function statePriority(state: ServiceStatusState) {
  if (state === "error") return 2;
  if (state === "warning") return 1;
  return 0;
}

function overallState(items: ServiceStatusItem[]): ServiceStatusState {
  return items.reduce<ServiceStatusState>((current, item) => (
    statePriority(item.state) > statePriority(current) ? item.state : current
  ), "ok");
}

async function timed<T>(operation: () => Promise<T>) {
  const startedAt = Date.now();
  const value = await operation();
  return {
    value,
    latencyMs: Date.now() - startedAt
  };
}

async function checkApp(): Promise<ServiceStatusItem> {
  return {
    id: "app",
    state: "ok",
    titleEn: "App server",
    titleZh: "应用服务器",
    summaryEn: "Next.js server is responding.",
    summaryZh: "Next.js 服务器正在响应。",
    detailsEn: [`Node environment: ${process.env.NODE_ENV || "development"}`],
    detailsZh: [`Node 环境：${process.env.NODE_ENV || "development"}`]
  };
}

async function checkDatabase(): Promise<ServiceStatusItem> {
  try {
    const result = await timed(() => prisma.$queryRaw`SELECT 1`);
    return {
      id: "database",
      state: "ok",
      titleEn: "SQLite database",
      titleZh: "SQLite 数据库",
      summaryEn: "Database query succeeded.",
      summaryZh: "数据库查询成功。",
      detailsEn: ["Prisma Client can query the local SQLite database."],
      detailsZh: ["Prisma Client 可以查询本地 SQLite 数据库。"],
      latencyMs: result.latencyMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "database",
      state: "error",
      titleEn: "SQLite database",
      titleZh: "SQLite 数据库",
      summaryEn: "Database query failed.",
      summaryZh: "数据库查询失败。",
      detailsEn: [message],
      detailsZh: [message]
    };
  }
}

async function checkAi(configuration: Awaited<ReturnType<typeof resolveAiConfiguration>>): Promise<ServiceStatusItem> {
  const provider = configuration.provider;
  const keyName = provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
  const configured = Boolean(configuration.apiKey);
  return {
    id: "ai",
    state: configured ? "ok" : "warning",
    titleEn: "AI recognition and recipes",
    titleZh: "AI 识别与菜谱",
    summaryEn: configured ? `${provider} is configured.` : `${provider} API key is missing.`,
    summaryZh: configured ? `${provider} 已配置。` : `${provider} API key 未配置。`,
    detailsEn: [
      `Provider: ${provider}`,
      `Model: ${configuration.model}`,
      `${keyName}: ${configured ? "configured" : "missing"}`,
      `Key source: ${configuration.usesProfileKey ? "this device" : "environment"}`
    ],
    detailsZh: [
      `服务商：${provider}`,
      `模型：${configuration.model}`,
      `${keyName}：${configured ? "已配置" : "未配置"}`,
      `密钥来源：${configuration.usesProfileKey ? "这台设备" : "环境变量"}`
    ]
  };
}

async function checkNutrition(configuration: Awaited<ReturnType<typeof resolveAiConfiguration>>): Promise<ServiceStatusItem> {
  const provider = configuration.provider;
  const configured = Boolean(configuration.apiKey);
  return {
    id: "nutrition",
    state: configured ? "ok" : "warning",
    titleEn: "AI nutrition estimation",
    titleZh: "AI 营养估算",
    summaryEn: configured ? "Nutrition estimation can use the configured AI provider." : "Nutrition estimation needs an AI API key.",
    summaryZh: configured ? "营养估算可以使用当前 AI 服务。" : "营养估算需要 AI API key。",
    detailsEn: [`Uses the same provider as Smart Scan: ${provider}.`],
    detailsZh: [`使用与智能扫描相同的服务商：${provider}。`]
  };
}

async function checkMealDb(): Promise<ServiceStatusItem> {
  const url = `https://www.themealdb.com/api/json/v1/${mealDbKey()}/search.php?s=Arrabiata`;
  try {
    const result = await timed(() => fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3500)
    }));
    return {
      id: "mealdb",
      state: result.value.ok ? "ok" : "warning",
      titleEn: "TheMealDB images",
      titleZh: "TheMealDB 图片",
      summaryEn: result.value.ok ? "TheMealDB is reachable." : `TheMealDB returned HTTP ${result.value.status}.`,
      summaryZh: result.value.ok ? "TheMealDB 可以连接。" : `TheMealDB 返回 HTTP ${result.value.status}。`,
      detailsEn: [`THEMEALDB_API_KEY: ${maskedConfigured("THEMEALDB_API_KEY")}`],
      detailsZh: [`THEMEALDB_API_KEY：${zhConfigured("THEMEALDB_API_KEY")}`],
      latencyMs: result.latencyMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "mealdb",
      state: "warning",
      titleEn: "TheMealDB images",
      titleZh: "TheMealDB 图片",
      summaryEn: "TheMealDB could not be reached.",
      summaryZh: "无法连接 TheMealDB。",
      detailsEn: [message],
      detailsZh: [message]
    };
  }
}

async function checkEpicure(): Promise<ServiceStatusItem> {
  const url = envValue("EPICURE_MCP_URL") || DEFAULT_EPICURE_MCP_URL;
  try {
    const result = await timed(() => fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "daily-health-status", version: "1.0.0" }
        }
      }),
      signal: AbortSignal.timeout(4500)
    }));
    return {
      id: "epicure",
      state: result.value.ok ? "ok" : "warning",
      titleEn: "Epicure flavor pairing",
      titleZh: "Epicure 风味搭配",
      summaryEn: result.value.ok ? "Epicure endpoint responded." : `Epicure returned HTTP ${result.value.status}.`,
      summaryZh: result.value.ok ? "Epicure 端点有响应。" : `Epicure 返回 HTTP ${result.value.status}。`,
      detailsEn: [`Endpoint: ${url}`],
      detailsZh: [`端点：${url}`],
      latencyMs: result.latencyMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "epicure",
      state: "warning",
      titleEn: "Epicure flavor pairing",
      titleZh: "Epicure 风味搭配",
      summaryEn: "Epicure endpoint could not be reached.",
      summaryZh: "无法连接 Epicure 端点。",
      detailsEn: [`Endpoint: ${url}`, message],
      detailsZh: [`端点：${url}`, message]
    };
  }
}

async function checkLocalImage(geminiApiKey: string | null): Promise<ServiceStatusItem> {
  const provider = recipeImageProvider();

  if (provider === "disabled") {
    return {
      id: "localImage",
      state: "ok",
      titleEn: "Recipe image generation",
      titleZh: "菜谱图片生成",
      summaryEn: "Generated images are disabled. The app will use approved cache and free image sources only.",
      summaryZh: "生图已关闭。应用只会使用已批准缓存和免费图库。",
      detailsEn: ["Provider: disabled"],
      detailsZh: ["服务商：disabled"]
    };
  }

  if (provider === "gemini") {
    const configured = Boolean(geminiApiKey);
    const model = envValue("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image";
    return {
      id: "localImage",
      state: configured ? "ok" : "warning",
      titleEn: "Recipe image generation",
      titleZh: "菜谱图片生成",
      summaryEn: configured ? "Gemini image generation is configured." : "Gemini image generation needs GEMINI_API_KEY.",
      summaryZh: configured ? "Gemini 生图已配置。" : "Gemini 生图需要 GEMINI_API_KEY。",
      detailsEn: [`Provider: gemini`, `Image model: ${model}`],
      detailsZh: [`服务商：gemini`, `图片模型：${model}`]
    };
  }

  if (provider === "replicate") {
    const configured = hasEnv("REPLICATE_API_TOKEN");
    return {
      id: "localImage",
      state: configured ? "ok" : "warning",
      titleEn: "Cloud recipe image generation",
      titleZh: "云端菜谱生图",
      summaryEn: configured ? "Replicate image generation is configured." : "Replicate image generation needs REPLICATE_API_TOKEN.",
      summaryZh: configured ? "Replicate 生图已配置。" : "Replicate 生图需要 REPLICATE_API_TOKEN。",
      detailsEn: [`Provider: replicate`, `Model: ${replicateImageModel()}`, `REPLICATE_API_TOKEN: ${maskedConfigured("REPLICATE_API_TOKEN")}`],
      detailsZh: [`服务商：replicate`, `模型：${replicateImageModel()}`, `REPLICATE_API_TOKEN：${zhConfigured("REPLICATE_API_TOKEN")}`]
    };
  }

  const api = localImageApi();
  const baseUrl = api === "sdwebui" ? sdWebUiUrl() : comfyUiUrl();
  const path = api === "sdwebui" ? "/sdapi/v1/options" : "/system_stats";
  try {
    const result = await timed(() => fetch(`${baseUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2500)
    }));
    return {
      id: "localImage",
      state: result.value.ok ? "ok" : "warning",
      titleEn: "Local recipe image generation",
      titleZh: "本地菜谱生图",
      summaryEn: result.value.ok ? `${api} is reachable.` : `${api} returned HTTP ${result.value.status}.`,
      summaryZh: result.value.ok ? `${api} 可以连接。` : `${api} 返回 HTTP ${result.value.status}。`,
      detailsEn: [`Endpoint: ${baseUrl}${path}`],
      detailsZh: [`端点：${baseUrl}${path}`],
      latencyMs: result.latencyMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "localImage",
      state: "warning",
      titleEn: "Local recipe image generation",
      titleZh: "本地菜谱生图",
      summaryEn: `${api} could not be reached.`,
      summaryZh: `无法连接 ${api}。`,
      detailsEn: [`Endpoint: ${baseUrl}${path}`, message],
      detailsZh: [`端点：${baseUrl}${path}`, message]
    };
  }
}

async function checkRecipeImages(): Promise<ServiceStatusItem> {
  const provider = recipeImageProvider();
  const cacheCount = await prisma.recipeImageCache.count().catch(() => 0);
  const summaryEn =
    provider === "disabled"
      ? "The app will use approved image cache, TheMealDB, and Wikimedia only."
      : provider === "local"
        ? "The app will use approved cache and free image sources first, then local image generation."
        : provider === "gemini"
          ? "The app will use approved cache and free image sources first, then Gemini image generation."
          : "The app will use approved cache and free image sources first, then Replicate cloud generation.";
  const summaryZh =
    provider === "disabled"
      ? "应用只会使用已批准图片缓存、TheMealDB 和 Wikimedia。"
      : provider === "local"
        ? "应用会先使用已批准缓存和免费图库，再使用本地生图。"
        : provider === "gemini"
          ? "应用会先使用已批准缓存和免费图库，再使用 Gemini 生图。"
          : "应用会先使用已批准缓存和免费图库，再使用 Replicate 云端生图。";

  return {
    id: "recipeImages",
    state: "ok",
    titleEn: "Recipe image pipeline",
    titleZh: "菜谱图片流程",
    summaryEn,
    summaryZh,
    detailsEn: [
      `RECIPE_IMAGE_PROVIDER: ${provider}`,
      `LOCAL_IMAGE_API: ${localImageApi()}`,
      `Approved image cache: ${cacheCount}`
    ],
    detailsZh: [
      `RECIPE_IMAGE_PROVIDER：${provider}`,
      `LOCAL_IMAGE_API：${localImageApi()}`,
      `已批准图片缓存：${cacheCount}`
    ]
  };
}

export async function getServiceStatus(profileId?: string | null): Promise<ServiceStatusResponse> {
  const fallbackProfileId = profileId ?? null;
  const environmentProvider = defaultAiProvider();
  const configuration: Awaited<ReturnType<typeof resolveAiConfiguration>> = fallbackProfileId
    ? await resolveAiConfiguration(fallbackProfileId)
    : {
        provider: environmentProvider,
        apiKey: environmentProvider === "gemini" ? envValue("GEMINI_API_KEY") || null : envValue("OPENAI_API_KEY") || null,
        usesProfileKey: false,
        model: aiModel()
      };
  const geminiApiKey = fallbackProfileId ? await resolveGeminiApiKey(fallbackProfileId) : envValue("GEMINI_API_KEY") || null;
  const items = await Promise.all([
    checkApp(),
    checkDatabase(),
    checkAi(configuration),
    checkNutrition(configuration),
    checkRecipeImages(),
    checkMealDb(),
    checkEpicure(),
    checkLocalImage(geminiApiKey)
  ]);
  const overall = overallState(items);

  return {
    checkedAt: new Date().toISOString(),
    overall,
    items
  };
}
