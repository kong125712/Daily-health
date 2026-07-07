"use client";

import { reportClientError } from "@/lib/client/errorReporting";
import type { AppLocale } from "@/lib/types/domain";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  profileId?: string | null;
  locale?: AppLocale;
};

function localizedMessage(locale: AppLocale | undefined, en: string, zh: string) {
  return locale === "zh-CN" ? zh : en;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers();
  headers.set("accept", "application/json");
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.profileId) {
    headers.set("x-profile-id", options.profileId);
  }
  if (options.locale) {
    headers.set("x-app-locale", options.locale);
  }

  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch (fetchError) {
    const message = localizedMessage(
      options.locale,
      "Unable to reach the Daily Health server. Please make sure it is running and refresh the page.",
      "无法连接 Daily Health 服务器。请确认服务器正在运行，然后刷新页面。"
    );
    void reportClientError({
      source: "api-fetch",
      message,
      method,
      path,
      stack: fetchError instanceof Error ? fetchError.stack ?? null : null,
      details: { requestPath: path, kind: "network" }
    });
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const responseText = await response.text();
  const looksLikeJson = contentType.includes("application/json") || contentType.includes("+json");

  if (!looksLikeJson) {
    const returnedHtml = responseText.trimStart().startsWith("<");
    const message = returnedHtml
      ? localizedMessage(
          options.locale,
          "The server returned an HTML page instead of JSON. In the APK, make sure the server URL points to a running Daily Health backend, not a GitHub page or static website.",
          "服务器返回了网页而不是 JSON。APK 里的服务器地址必须指向正在运行的 Daily Health 后端，不能是 GitHub 页面或静态网站。"
        )
      : localizedMessage(
          options.locale,
          "The server returned a non-JSON response. Please check the Daily Health server URL and logs.",
          "服务器返回了非 JSON 内容。请检查 Daily Health 服务器地址和日志。"
        );
    void reportClientError({
      source: "api-fetch",
      message,
      method,
      path,
      statusCode: response.status || null,
      details: {
        requestPath: path,
        kind: returnedHtml ? "html-response" : "non-json-response",
        contentType,
        preview: responseText.slice(0, 300)
      }
    });
    throw new Error(message);
  }

  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    const message = localizedMessage(
      options.locale,
      "The Daily Health server returned invalid JSON. Please check the server logs.",
      "Daily Health 服务器返回了无效 JSON。请检查服务器日志。"
    );
    void reportClientError({
      source: "api-fetch",
      message,
      method,
      path,
      statusCode: response.status || null,
      details: {
        requestPath: path,
        kind: "invalid-json",
        contentType,
        preview: responseText.slice(0, 300)
      }
    });
    throw new Error(message);
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed.";
    void reportClientError({
      source: "api-fetch",
      severity: response.status >= 500 ? "error" : "warning",
      message,
      method,
      path,
      statusCode: response.status,
      details: {
        requestPath: path,
        kind: "api-error",
        statusText: response.statusText
      }
    });
    throw new Error(message);
  }

  return data as T;
}
