"use client";

import type { AppLocale } from "@/lib/types/domain";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  profileId?: string | null;
  locale?: AppLocale;
};

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

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error("Unable to reach the Daily Health server. Please make sure it is running and refresh the page.");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const responseText = await response.text();
  const looksLikeJson = contentType.includes("application/json") || contentType.includes("+json");

  if (!looksLikeJson) {
    const returnedHtml = responseText.trimStart().startsWith("<");
    const message = returnedHtml
      ? "The server returned an HTML page instead of JSON. In the APK, make sure the server URL points to a running Daily Health backend, not a GitHub page or static website."
      : "The server returned a non-JSON response. Please check the Daily Health server URL and logs.";
    throw new Error(message);
  }

  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error("The Daily Health server returned invalid JSON. Please check the server logs.");
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}
