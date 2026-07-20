export type CachedAuthStatus = {
  version: 1;
  subscribed: boolean;
  localMirror: boolean;
  testMode: boolean;
  profileId: string;
  accessToken?: string | null;
};

let localIdSequence = 0;

export function createProfileId() {
  // Keep startup independent from platform crypto polyfills. The profile ID is
  // a local storage namespace, not a credential or security boundary.
  localIdSequence = (localIdSequence + 1) % 1_000_000;
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}_${localIdSequence.toString(36)}`;
}

export function localStatus(profileId = createProfileId()): CachedAuthStatus {
  return { version: 1, subscribed: false, localMirror: false, testMode: false, profileId, accessToken: null };
}
