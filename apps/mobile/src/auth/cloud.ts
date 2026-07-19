import type { CachedAuthStatus } from "./status";

function baseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
  if (typeof location !== "undefined") return `${location.origin}/`;
  return "http://10.0.2.2:8787/";
}

export function cloudApiBaseUrl() { return baseUrl(); }

type CloudAuthResponse = {
  accessToken: string;
  profileId: string;
  subscribed: boolean;
  localMirror?: boolean;
};

export async function authenticateWithEmail(input: { email: string; password: string; action: "login" | "register" }): Promise<CachedAuthStatus> {
  let response: Response;
  try {
    response = await fetch(new URL(`/auth/${input.action}`, baseUrl()).toString(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: input.email.trim(), password: input.password })
    });
  } catch {
    throw new Error("Unable to reach the Daily Health cloud service.");
  }
  const payload = await response.json().catch(() => null) as CloudAuthResponse | { error?: string } | null;
  if (!response.ok || !payload || !("accessToken" in payload)) {
    throw new Error(payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Unable to sign in.");
  }
  return { version: 1, subscribed: payload.subscribed, localMirror: Boolean(payload.localMirror), testMode: false, profileId: payload.profileId, accessToken: payload.accessToken };
}

export async function revalidateCloudSession(status: CachedAuthStatus): Promise<CachedAuthStatus | null> {
  if (!status.subscribed || !status.accessToken) return status;
  try {
    const response = await fetch(new URL("/auth/session", baseUrl()).toString(), { headers: { authorization: `Bearer ${status.accessToken}`, accept: "application/json" } });
    if (!response.ok) return { ...status, subscribed: false, localMirror: false, testMode: false, accessToken: null };
    const payload = await response.json() as { profileId?: string; subscribed?: boolean; localMirror?: boolean };
    if (!payload.profileId) return null;
    return { ...status, profileId: payload.profileId, subscribed: Boolean(payload.subscribed), localMirror: Boolean(payload.localMirror), testMode: false };
  } catch {
    // A transient network failure must not replace a cached, paid session.
    return status;
  }
}
