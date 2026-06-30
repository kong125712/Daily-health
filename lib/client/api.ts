"use client";

import type { AppLocale } from "@/lib/types/domain";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: JsonValue;
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

  const data = (await response.json()) as unknown;
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
