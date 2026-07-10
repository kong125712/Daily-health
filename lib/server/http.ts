import { NextRequest, NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { normalizeLocale, translate, type TranslationKey } from "@/lib/i18n/translations";
import type { AppLocale } from "@/lib/types/domain";

export function localeFromRequest(request: NextRequest): AppLocale {
  return normalizeLocale(
    request.headers.get("x-app-locale") ??
      request.cookies.get("daily_health_locale")?.value ??
      request.nextUrl.searchParams.get("locale")
  );
}

export function profileIdFromRequest(request: NextRequest): string | null {
  return request.headers.get("x-profile-id") ?? request.nextUrl.searchParams.get("profileId");
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonMessageError(locale: AppLocale, key: TranslationKey, status: number) {
  return NextResponse.json({ error: translate(locale, key) }, { status });
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseJson<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S
): Promise<z.infer<S>> {
  const body = (await request.json()) as unknown;
  return schema.parse(body);
}

function isDatabaseConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("schema.prisma") &&
    (
      message.includes("database_url") ||
      message.includes("datasource") ||
      message.includes("environment variable not found") ||
      message.includes("url must start")
    )
  );
}

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError && errorMessage(error).includes("json");
}

function isAiQuotaError(error: unknown) {
  const message = errorMessage(error);
  return (
    errorStatus(error) === 429 ||
    message.includes("quota") ||
    message.includes("too many requests") ||
    message.includes("rate limit")
  );
}

function isAiAuthError(error: unknown) {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return (
    status === 401 ||
    status === 403 ||
    message.includes("api key not valid") ||
    message.includes("permission denied") ||
    message.includes("unauthorized")
  );
}

function isAiModelError(error: unknown) {
  const message = errorMessage(error);
  return errorStatus(error) === 404 && message.includes("model");
}

function isAiServiceUnavailableError(error: unknown) {
  const message = errorMessage(error);
  return (
    errorStatus(error) === 503 ||
    message.includes("service unavailable") ||
    message.includes("high demand")
  );
}

function isAiResponseFormatError(error: unknown) {
  const message = errorMessage(error);
  return message.includes("ai returned") && message.includes("unexpected format");
}

export function handleRouteError(error: unknown, locale: AppLocale) {
  if (error instanceof ZodError) {
    return jsonError(error.issues.map((issue) => issue.message).join(", "), 400);
  }

  if (isJsonParseError(error)) {
    return jsonError(
      locale === "zh-CN"
        ? "请求内容不是有效 JSON，请检查手机或网页发出的 API 请求。"
        : "The request body is not valid JSON. Check the API request sent by the phone or browser.",
      400
    );
  }

  if (isDatabaseConfigurationError(error)) {
    console.error(error);
    return jsonError(
      "Database is not configured correctly. For this SQLite app, set DATABASE_URL to file:./daily-health.db and regenerate Prisma Client.",
      503
    );
  }

  if (isAiQuotaError(error)) {
    console.error(error);
    return jsonError(
      locale === "zh-CN"
        ? "AI 配额已用完，或这个 API key 所属项目没有可用额度。请检查 Gemini/OpenAI 的额度、账单，或换一个 API key。"
        : "AI quota is exhausted, or this API key's project has no available quota. Check Gemini/OpenAI quota, billing, or use another API key.",
      429
    );
  }

  if (isAiAuthError(error)) {
    console.error(error);
    return jsonError(
      locale === "zh-CN"
        ? "AI API key 无效或没有权限。请重新生成 API key，并确认对应服务已经启用。"
        : "The AI API key is invalid or does not have permission. Generate a new API key and confirm the service is enabled.",
      401
    );
  }

  if (isAiModelError(error)) {
    console.error(error);
    return jsonError(
      locale === "zh-CN"
        ? "当前 AI 模型不可用。请设置 GEMINI_MODEL 为可用模型，或更新 API key 所属项目。"
        : "The selected AI model is not available. Set GEMINI_MODEL to an available model or update the API key project.",
      503
    );
  }

  if (isAiServiceUnavailableError(error)) {
    console.error(error);
    return jsonError(
      locale === "zh-CN"
        ? "AI 服务当前繁忙，请稍后再试，或换一个 GEMINI_MODEL。"
        : "The AI service is currently busy. Try again later or use a different GEMINI_MODEL.",
      503
    );
  }

  if (isAiResponseFormatError(error)) {
    console.error(error);
    return jsonError(
      locale === "zh-CN"
        ? "AI 返回的内容格式不正确。请再试一次，或换一个 GEMINI_MODEL。"
        : "The AI returned an unexpected response format. Try again or use a different GEMINI_MODEL.",
      502
    );
  }

  console.error(error);
  return jsonMessageError(locale, "common.error", 500);
}
