import * as SecureStore from "expo-secure-store";
import { type CachedAuthStatus, localStatus } from "./status";

const cacheKey = "daily-health.auth-status.v1";

function parse(value: string | null): CachedAuthStatus | null {
  if (!value) return null;
  try {
    const result = JSON.parse(value) as Partial<CachedAuthStatus>;
    if (result.version !== 1 || typeof result.profileId !== "string") return null;
    return {
      version: 1,
      subscribed: Boolean(result.subscribed),
      localMirror: Boolean(result.localMirror),
      testMode: Boolean(result.testMode),
      profileId: result.profileId,
      accessToken: typeof result.accessToken === "string" ? result.accessToken : null
    };
  } catch {
    return null;
  }
}

export async function readCachedAuthStatus(fallback = localStatus()): Promise<CachedAuthStatus> {
  try {
    return parse(await SecureStore.getItemAsync(cacheKey)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeCachedAuthStatus(status: CachedAuthStatus) {
  await SecureStore.setItemAsync(cacheKey, JSON.stringify(status));
}
