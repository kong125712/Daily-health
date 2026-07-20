import type { CachedAuthStatus } from "../auth/status";
import { cloudApiBaseUrl } from "../auth/cloud";
import { RemoteAdapter } from "./RemoteAdapter";
import type { DataAdapter } from "./DataAdapter";

export function resolveAdapter(status: CachedAuthStatus): { adapter: DataAdapter; status: CachedAuthStatus } {
  return {
    adapter: new RemoteAdapter({
      baseUrl: cloudApiBaseUrl(),
      profileId: status.profileId,
      accessToken: status.accessToken
    }),
    status
  };
}
