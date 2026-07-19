export type CachedAuthStatus = {
  version: 1;
  subscribed: boolean;
  localMirror: boolean;
  testMode: boolean;
  profileId: string;
  accessToken?: string | null;
};

export function createProfileId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return `local_${cryptoApi.randomUUID()}`;
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function localStatus(profileId = createProfileId()): CachedAuthStatus {
  return { version: 1, subscribed: false, localMirror: false, testMode: false, profileId, accessToken: null };
}
