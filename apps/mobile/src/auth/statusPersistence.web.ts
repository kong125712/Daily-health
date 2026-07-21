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
      localMirror: false,
      testMode: false,
      profileId: result.profileId,
      accessToken: typeof result.accessToken === "string" ? result.accessToken : null
    };
  } catch {
    return null;
  }
}

// Web is cloud-only. Browser storage persists an authenticated cloud session,
// never health records or a local-mode database.
export async function readCachedAuthStatus(
  fallback = { ...localStatus("web-remote"), subscribed: false, testMode: false }
): Promise<CachedAuthStatus> {
  if (typeof localStorage === "undefined") return fallback;
  return parse(localStorage.getItem(cacheKey)) ?? fallback;
}

export async function writeCachedAuthStatus(status: CachedAuthStatus) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(cacheKey, JSON.stringify({ ...status, localMirror: false, testMode: false }));
  }
}
