import { readCachedAuthStatus } from "../auth/status.web";
import { cloudApiBaseUrl } from "../auth/cloud";
import { RemoteAdapter } from "./RemoteAdapter";
import type { DataAdapter } from "./DataAdapter";

export function resolveAdapter(): { adapter: DataAdapter; status: ReturnType<typeof readCachedAuthStatus> } {
  const status = readCachedAuthStatus();
  return {
    adapter: new RemoteAdapter({
      baseUrl: cloudApiBaseUrl(),
      profileId: status.profileId,
      accessToken: status.accessToken
    }),
    status
  };
}
